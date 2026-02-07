import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import { PassThrough } from 'stream';
import * as querystring from 'querystring';
import { LRUCache } from 'lru-cache';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { urlCache } from './util/url-cache';
import { addQueryToUrl } from './util/query-builder';
import ConfigLoader from './config/ConfigLoader';
import { globalCookieJar, CookieJar } from './cookie/globalCookieJar';
import { TimeoutError, RetryExhaustedError } from './errors';
import {
  ClientConfig,
  RequestConfig,
  NklientResponse,
  RequestInterceptor,
  ResponseInterceptor,
  InterceptorArrays,
  DownloadProgress
} from './types';

// Global connection pool with keep-alive
const agents = {
  http: new http.Agent({ keepAlive: true, maxSockets: 50 }),
  https: new https.Agent({ keepAlive: true, maxSockets: 50 }),
};

// Proxy agent cache with automatic eviction
class ProxyAgentCache {
  private cache: LRUCache<string, http.Agent | https.Agent>;

  constructor(options: { maxSize?: number; ttl?: number } = {}) {
    this.cache = new LRUCache<string, http.Agent | https.Agent>({
      max: options.maxSize || 100,
      ttl: options.ttl || 1000 * 60 * 5,
      dispose: (value: http.Agent | https.Agent) => {
        if (value && typeof value.destroy === 'function') {
          value.destroy();
        }
      },
      noDisposeOnSet: false
    });
  }

  get(key: string): http.Agent | https.Agent | undefined {
    return this.cache.get(key);
  }

  set(key: string, agent: http.Agent | https.Agent): void {
    this.cache.set(key, agent);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.forEach((agent) => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
    });
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

const proxyAgents = new ProxyAgentCache();

// Global interceptors (used by nklient.get/post/etc directly)
const globalInterceptors: InterceptorArrays = {
  request: [],
  response: []
};

// Helper: create an interceptor manager bound to a specific interceptor array
function createInterceptorManager(arrays: InterceptorArrays) {
  return {
    request: {
      use(interceptor: RequestInterceptor): number {
        arrays.request.push(interceptor);
        return arrays.request.length - 1;
      },
      eject(id: number): void {
        if (id >= 0 && id < arrays.request.length) {
          arrays.request[id] = null;
          const nullCount = arrays.request.filter(i => i === null).length;
          if (nullCount > 3) {
            arrays.request = arrays.request.filter(i => i !== null);
          }
        }
      }
    },
    response: {
      use(interceptor: ResponseInterceptor): number {
        arrays.response.push(interceptor);
        return arrays.response.length - 1;
      },
      eject(id: number): void {
        if (id >= 0 && id < arrays.response.length) {
          arrays.response[id] = null;
          const nullCount = arrays.response.filter(i => i === null).length;
          if (nullCount > 3) {
            arrays.response = arrays.response.filter(i => i !== null);
          }
        }
      }
    }
  };
}

// RequestWrapper class for fluent API
class RequestWrapper {
  method: string;
  uri: string | undefined;
  config: Partial<ClientConfig>;
  _jar: CookieJar | null;
  _headers: Record<string, string>;
  _query: Record<string, any> | null;
  _body: string | Buffer | null;
  _json: any;
  _form: Record<string, any> | null;
  _proxy: string | null;
  _agent: http.Agent | https.Agent | null;
  _retry: ClientConfig['retry'] | null;
  _maxRedirects: number;
  _encoding: BufferEncoding | null;
  _stream: boolean;
  _rejectUnauthorized: boolean;
  _onDownloadProgress: ((progress: DownloadProgress) => void) | null;
  _maxResponseSize: number | null;
  _timeout: number;
  _followRedirects: boolean;
  _decompress: boolean;
  _cookies: string | Record<string, string> | null;
  private interceptors: InterceptorArrays;

  constructor(
    method: string,
    uri: string | undefined,
    config: Partial<ClientConfig> = {},
    jar: CookieJar | null = null,
    interceptors: InterceptorArrays = globalInterceptors
  ) {
    this.method = method;
    this.uri = uri;
    this.config = config;
    this._jar = jar || (config.cookies ? globalCookieJar : null);
    this._headers = {};
    this._query = null;
    this._body = null;
    this._json = null;
    this._form = null;
    this._proxy = null;
    this._agent = null;
    this._retry = (config as ClientConfig).retry || null;
    this._maxRedirects = config.maxRedirects !== undefined ? config.maxRedirects : 5;
    this._encoding = 'utf8';
    this._stream = false;
    this._rejectUnauthorized = config.rejectUnauthorized !== undefined ? config.rejectUnauthorized : true;
    this._onDownloadProgress = null;
    this._maxResponseSize = null;
    this._timeout = config.timeout || 30000;
    this._followRedirects = config.followRedirects !== undefined ? config.followRedirects : true;
    this._decompress = config.decompress !== undefined ? config.decompress : true;
    this._cookies = null;
    this.interceptors = interceptors;
  }

  headers(name: string | Record<string, string>, value?: string): this {
    if (typeof name === 'string' && value !== undefined) {
      this._headers[name] = value;
    } else if (typeof name === 'object') {
      Object.assign(this._headers, name);
    }
    return this;
  }

  body(data: string | Buffer): this {
    this._body = data;
    return this;
  }

  timeout(ms: number): this {
    this._timeout = ms;
    return this;
  }

  query(params: Record<string, any>): this {
    this._query = params;
    return this;
  }

  form(data: Record<string, any>): this {
    this._form = data;
    return this;
  }

  json(data: any): this {
    this._json = data;
    return this;
  }

  proxy(proxyUrl: string): this {
    this._proxy = proxyUrl;
    return this;
  }

  agent(agent: http.Agent | https.Agent): this {
    this._agent = agent;
    return this;
  }

  jar(jar: CookieJar): this {
    this._jar = jar;
    return this;
  }

  noJar(): this {
    this._jar = null;
    return this;
  }

  cookies(cookies: string | Record<string, string>): this {
    if (!this.uri) {
      throw new Error('URI must be set before adding cookies');
    }
    if (typeof cookies === 'object') {
      // Validate cookie names/values
      for (const key of Object.keys(cookies)) {
        if (/[\r\n]/.test(key) || /[\r\n]/.test(String(cookies[key]))) {
          throw new Error('Failed to set cookies: invalid characters in cookie name or value');
        }
      }
    }
    this._cookies = cookies;
    return this;
  }

  retry(options: ClientConfig['retry'] | Partial<ClientConfig['retry']>): this {
    this._retry = options as ClientConfig['retry'];
    return this;
  }

  maxRedirects(count: number): this {
    this._maxRedirects = count;
    return this;
  }

  encoding(enc: BufferEncoding | null): this {
    this._encoding = enc;
    return this;
  }

  stream(): this {
    this._stream = true;
    return this;
  }

  rejectUnauthorized(value: boolean): this {
    this._rejectUnauthorized = value;
    return this;
  }

  onDownloadProgress(fn: (progress: DownloadProgress) => void): this {
    this._onDownloadProgress = fn;
    return this;
  }

  maxResponseSize(size: number): this {
    this._maxResponseSize = size;
    return this;
  }

  async exec(): Promise<NklientResponse> {
    if (!this.uri) {
      throw new Error('URI is required');
    }

    // Build full URL with base URL if configured
    let fullUrl = this.uri;
    if (this.config.baseUrl && !this.uri.startsWith('http')) {
      fullUrl = this.config.baseUrl + this.uri;
    }

    // Add query parameters
    if (this._query) {
      fullUrl = addQueryToUrl(fullUrl, this._query);
    }

    // Prepare headers
    const headers: Record<string, string> = Object.assign(
      {},
      (this.config as ClientConfig).defaultHeaders,
      this._headers
    );

    // Prepare body
    let body: string | Buffer | undefined = this._body || undefined;
    if (this._json) {
      body = JSON.stringify(this._json);
      headers['Content-Type'] = 'application/json';
    } else if (this._form) {
      body = querystring.stringify(this._form);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    // Add cookies if jar is available
    if (this._jar) {
      try {
        const cookies = await getCookiesHelper(fullUrl, this._jar);
        if (cookies && cookies.length > 0) {
          headers['Cookie'] = cookies.map((c: any) => c.cookieString()).join('; ');
        }
      } catch (_err) {
        // Ignore cookie errors
      }
    }

    // Apply request interceptors
    let requestConfig: RequestConfig = {
      method: this.method,
      uri: fullUrl,
      headers,
      body,
      timeout: this._timeout,
      maxRedirects: this._maxRedirects,
      followRedirects: this._followRedirects,
      decompress: this._decompress,
      rejectUnauthorized: this._rejectUnauthorized
    };

    for (const interceptor of this.interceptors.request) {
      if (interceptor) {
        requestConfig = await interceptor(requestConfig);
      }
    }

    // Make the actual request (with retry logic if configured)
    const retryConfig = this._retry;
    const maxAttempts = retryConfig?.attempts || 1;
    const retryDelay = retryConfig?.delay || 1000;
    const backoffMultiplier = retryConfig?.backoffMultiplier || 2;
    const maxDelay = retryConfig?.maxDelay || 30000;
    const retryOnStatusCodes = retryConfig?.retryOnStatusCodes || [408, 429, 500, 502, 503, 504];

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this._makeRequest(requestConfig);

        // Check if status code is retryable
        if (maxAttempts > 1 && retryOnStatusCodes.includes(response.statusCode)) {
          if (attempt < maxAttempts) {
            // Wait before retrying
            const delay = Math.min(retryDelay * Math.pow(backoffMultiplier, attempt - 1), maxDelay);
            await new Promise(resolve => setTimeout(resolve, delay));
            lastError = new Error(`Server responded with ${response.statusCode}`);
            continue;
          }
          // Last attempt still returned a retryable status - throw
          throw new RetryExhaustedError(
            maxAttempts,
            new Error(`Server responded with ${response.statusCode}`)
          );
        }

        // Apply response interceptors
        let finalResponse = response;
        for (const interceptor of this.interceptors.response) {
          if (interceptor) {
            finalResponse = await interceptor(finalResponse);
          }
        }

        return finalResponse;
      } catch (err) {
        lastError = err as Error;

        // Don't retry on the last attempt
        if (attempt >= maxAttempts) {
          // If retry was configured (more than 1 attempt) and all failed, throw RetryExhaustedError
          if (maxAttempts > 1) {
            throw new RetryExhaustedError(maxAttempts, lastError);
          }
          throw lastError;
        }

        // Wait before retrying on network errors
        const delay = Math.min(retryDelay * Math.pow(backoffMultiplier, attempt - 1), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error('Unexpected retry state');
  }

  private _makeRequest(config: RequestConfig, redirectCount = 0): Promise<NklientResponse> {
    return new Promise((resolve, reject) => {
      const urlObj = urlCache.get(config.uri);
      const protocol = urlObj.protocol.replace(':', '');

      // Select appropriate HTTP module
      let httpModule: typeof http | typeof https;
      if (protocol === 'https') {
        httpModule = https;
      } else {
        httpModule = http;
      }

      const requestOptions: https.RequestOptions = {
        method: config.method,
        hostname: urlObj.hostname,
        port: urlObj.port || (protocol === 'https' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        headers: config.headers,
        agent: this._agent || (agents as any)[protocol] || agents.http,
        rejectUnauthorized: config.rejectUnauthorized
      };

      if (this._proxy) {
        const proxyKey = `${this._proxy}:${protocol}`;
        if (proxyAgents.has(proxyKey)) {
          requestOptions.agent = proxyAgents.get(proxyKey);
        } else {
          let proxyAgent: http.Agent | https.Agent;
          if (protocol === 'https') {
            proxyAgent = new HttpsProxyAgent(this._proxy);
          } else {
            proxyAgent = new HttpProxyAgent(this._proxy);
          }
          proxyAgents.set(proxyKey, proxyAgent);
          requestOptions.agent = proxyAgent;
        }
      }

      const req = httpModule.request(requestOptions, (res) => {
        // Handle redirects
        if (config.followRedirects && [301, 302, 303, 307, 308].includes(res.statusCode!) && res.headers.location) {
          if (redirectCount >= config.maxRedirects) {
            reject(new Error('Maximum redirects exceeded'));
            return;
          }

          // Consume response to free up the socket
          res.resume();

          // Follow redirect
          const redirectUrl = urlCache.getWithBase(res.headers.location, config.uri);
          config.uri = redirectUrl.toString();

          setImmediate(() => {
            this._makeRequest(config, redirectCount + 1).then(resolve).catch(reject);
          });
          return;
        }

        // Setup decompression if needed
        let responseStream: NodeJS.ReadableStream = res;
        if (config.decompress && res.headers['content-encoding']) {
          const encoding = res.headers['content-encoding'];
          if (encoding.includes('gzip')) {
            responseStream = res.pipe(zlib.createGunzip());
          } else if (encoding.includes('deflate')) {
            responseStream = res.pipe(zlib.createInflate());
          } else if (encoding.includes('br')) {
            responseStream = res.pipe(zlib.createBrotliDecompress());
          }
        }

        // Streaming mode: resolve with the stream as body immediately
        if (this._stream) {
          // Pipe through a PassThrough so we always return a proper Readable
          const passThrough = new PassThrough();
          (responseStream as NodeJS.ReadableStream).pipe(passThrough);
          // Forward errors from source stream to passThrough
          (responseStream as NodeJS.ReadableStream).on('error', (err: Error) => {
            passThrough.destroy(err);
          });

          // Store cookies before resolving
          const cookiePromise = (this._jar && res.headers['set-cookie'])
            ? Promise.all(res.headers['set-cookie'].map(cookie =>
                setCookieHelper(cookie, config.uri, this._jar!).catch(() => {})
              ))
            : Promise.resolve();

          cookiePromise.then(() => {
            resolve({
              statusCode: res.statusCode!,
              headers: res.headers as NklientResponse['headers'],
              body: passThrough as any
            });
          });
          return;
        }

        // Buffered mode: collect chunks then resolve
        const chunks: Buffer[] = [];
        let totalSize = 0;

        responseStream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          totalSize += chunk.length;

          if (this._maxResponseSize && totalSize > this._maxResponseSize) {
            (responseStream as any).destroy();
            reject(new Error('Response body too large'));
            return;
          }

          if (this._onDownloadProgress) {
            this._onDownloadProgress({
              loaded: totalSize,
              total: res.headers['content-length'] ? parseInt(res.headers['content-length']) : undefined
            });
          }
        });

        responseStream.on('end', () => {
          let body: any = Buffer.concat(chunks);

          if (this._encoding === null) {
            // Return raw buffer
          } else if (this._encoding) {
            body = body.toString(this._encoding);

            if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
              try {
                body = JSON.parse(body);
              } catch (_e) {
                // Keep as string if JSON parsing fails
              }
            }
          }

          // Store cookies if jar is available
          if (this._jar && res.headers['set-cookie']) {
            const setCookiePromises = res.headers['set-cookie'].map(cookie =>
              setCookieHelper(cookie, config.uri, this._jar!).catch(() => {})
            );
            Promise.all(setCookiePromises).then(() => {
              resolve({
                statusCode: res.statusCode!,
                headers: res.headers as NklientResponse['headers'],
                body
              });
            });
          } else {
            resolve({
              statusCode: res.statusCode!,
              headers: res.headers as NklientResponse['headers'],
              body
            });
          }
        });

        responseStream.on('error', (err: Error) => {
          reject(err);
        });
      });

      // Set timeout
      if (config.timeout) {
        req.setTimeout(config.timeout, () => {
          req.destroy();
          reject(new TimeoutError());
        });
      }

      req.on('error', (err: Error) => {
        reject(err);
      });

      // Write body if present
      if (config.body) {
        req.write(config.body);
      }

      req.end();
    });
  }

  // Make RequestWrapper thenable (await nklient.get(url) auto-executes)
  then<TResult1 = NklientResponse, TResult2 = never>(
    onfulfilled?: ((value: NklientResponse) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<NklientResponse | TResult> {
    return this.exec().catch(onrejected);
  }
}

// Cookie helper functions
function setCookieHelper(cookie: string, url: string, jar: CookieJar | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!jar) {
      reject(new Error('No cookie jar available'));
      return;
    }
    jar.setCookie(cookie, url, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getCookiesHelper(url: string, jar: CookieJar | null): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (!jar) {
      resolve([]);
      return;
    }
    jar.getCookies(url, (err: Error | null, cookies: any[]) => {
      if (err) reject(err);
      else resolve(cookies || []);
    });
  });
}

function clearCookiesHelper(jar: CookieJar | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!jar) {
      resolve();
      return;
    }
    if (typeof jar.removeAllCookies === 'function') {
      jar.removeAllCookies((err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    } else {
      resolve();
    }
  });
}

// Main nklient object
const nklient = {
  // Direct HTTP methods (use global interceptors)
  get(uri?: string) {
    return new RequestWrapper('GET', uri);
  },

  post(uri?: string) {
    return new RequestWrapper('POST', uri);
  },

  put(uri?: string) {
    return new RequestWrapper('PUT', uri);
  },

  patch(uri?: string) {
    return new RequestWrapper('PATCH', uri);
  },

  delete(uri?: string) {
    return new RequestWrapper('DELETE', uri);
  },

  head(uri?: string) {
    return new RequestWrapper('HEAD', uri);
  },

  options(uri?: string) {
    return new RequestWrapper('OPTIONS', uri);
  },

  request(options: any): RequestWrapper {
    const uri = typeof options === 'string' ? options : (options && (options.uri || options.url));
    const method = typeof options === 'string' ? 'GET' : (options && options.method || 'GET');
    return new RequestWrapper(method, uri || undefined);
  },

  // Create client with configuration (alias: create)
  create(config?: any) {
    return this.createClient(config);
  },

  createClient(config?: string | Record<string, any>) {
    const configLoader = new ConfigLoader();
    let clientConfig: ClientConfig;

    if (typeof config === 'string') {
      try {
        clientConfig = configLoader.loadFromFile(config);
      } catch (err: any) {
        throw new Error(`Failed to create client: ${err.message}`);
      }
    } else if (config && typeof config === 'object') {
      try {
        clientConfig = configLoader.loadConfig(config);
      } catch (err: any) {
        throw new Error(`Failed to create client: ${err.message}`);
      }
    } else {
      clientConfig = configLoader.getDefaultConfig();
    }

    // Create cookie jar if cookies are enabled
    const jar = clientConfig.cookies ? new CookieJar() : null;

    // Per-instance interceptor arrays (fixes global state leak)
    const clientInterceptors: InterceptorArrays = {
      request: [],
      response: []
    };

    const client = {
      config: clientConfig,
      jar,

      get(uri: string) {
        return new RequestWrapper('GET', uri, clientConfig, jar, clientInterceptors);
      },

      post(uri: string) {
        return new RequestWrapper('POST', uri, clientConfig, jar, clientInterceptors);
      },

      put(uri: string) {
        return new RequestWrapper('PUT', uri, clientConfig, jar, clientInterceptors);
      },

      patch(uri: string) {
        return new RequestWrapper('PATCH', uri, clientConfig, jar, clientInterceptors);
      },

      delete(uri: string) {
        return new RequestWrapper('DELETE', uri, clientConfig, jar, clientInterceptors);
      },

      head(uri: string) {
        return new RequestWrapper('HEAD', uri, clientConfig, jar, clientInterceptors);
      },

      options(uri: string) {
        return new RequestWrapper('OPTIONS', uri, clientConfig, jar, clientInterceptors);
      },

      request(options: any) {
        const uri = typeof options === 'string' ? options : (options.uri || options.url);
        const method = typeof options === 'string' ? 'GET' : (options.method || 'GET');
        const wrapper = new RequestWrapper(method, uri, clientConfig, jar, clientInterceptors);

        if (typeof options === 'object') {
          if (options.headers) wrapper.headers(options.headers);
          if (options.body) wrapper.body(options.body);
          if (options.json) wrapper.json(options.json);
          if (options.form) wrapper.form(options.form);
          if (options.timeout !== undefined) wrapper.timeout(options.timeout);
          if (options.maxRedirects !== undefined) wrapper.maxRedirects(options.maxRedirects);
        }

        return wrapper;
      },

      // Client-specific interceptors (isolated from global)
      interceptors: createInterceptorManager(clientInterceptors),

      compactInterceptors() {
        clientInterceptors.request = clientInterceptors.request.filter(i => i !== null);
        clientInterceptors.response = clientInterceptors.response.filter(i => i !== null);
      },

      getInterceptorArrayLength(type: 'request' | 'response') {
        return clientInterceptors[type] ? clientInterceptors[type].length : 0;
      },

      clearProxyAgents() {
        proxyAgents.clear();
      },

      getProxyAgentCacheSize() {
        return proxyAgents.size;
      }
    };

    return client;
  },

  // Cookie methods
  setCookie: setCookieHelper,
  getCookies: getCookiesHelper,

  clearCookies(jar?: CookieJar | null) {
    if (jar === null) {
      // Explicitly passed null: do nothing
      return Promise.resolve();
    }
    return clearCookiesHelper(jar || globalCookieJar);
  },

  jar(): CookieJar {
    return new CookieJar();
  },

  // Agent management
  closeAgents() {
    Object.values(agents).forEach(agent => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
    });
  },

  // Cleanup method
  cleanup() {
    this.clearProxyAgents();
    this.closeAgents();
    urlCache.clear();
    clearCookiesHelper(globalCookieJar).catch(() => {});
  },

  // Global interceptor management
  interceptors: createInterceptorManager(globalInterceptors),

  compactInterceptors() {
    globalInterceptors.request = globalInterceptors.request.filter(i => i !== null);
    globalInterceptors.response = globalInterceptors.response.filter(i => i !== null);
  },

  getInterceptorArrayLength(type: 'request' | 'response') {
    return globalInterceptors[type] ? globalInterceptors[type].length : 0;
  },

  clearProxyAgents() {
    proxyAgents.clear();
  },

  getProxyAgentCacheSize() {
    return proxyAgents.size;
  }
};

export = nklient;

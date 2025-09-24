const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline: pipelineAsync } = require('stream');
const { URL } = require('url');
const { extend, isJSON } = require('./util');
const ConfigLoader = require('./config/ConfigLoader');
const { globalCookieJar, CookieJar } = require('./cookie/globalCookieJar');
const { urlCache } = require('./util/url-cache');
const { addQueryToUrl } = require('./util/query-builder');
const { LRUCache } = require('lru-cache');
const querystring = require('querystring');
const { Readable } = require('stream');
const util = require('util');
const pipeline = util.promisify(pipelineAsync);

// Check if http2 is available
let http2;
try {
  http2 = require('http2');
} catch (e) {
  http2 = null;
}

const agents = {
  http: new http.Agent({ keepAlive: true, maxSockets: 50 }),
  https: new https.Agent({ keepAlive: true, maxSockets: 50 }),
};

if (http2 && typeof http2.Http2Agent === 'function') {
  agents.http2 = new http2.Http2Agent({ keepAlive: true, maxSockets: 50 });
}

const interceptors = {
  request: [],
  response: []
};

// Proxy agent cache with automatic eviction
class ProxyAgentCache {
  constructor(options = {}) {
    this.cache = new LRUCache({
      max: options.maxSize || 100,
      ttl: options.ttl || 1000 * 60 * 5, // 5 minutes default
      dispose: (value, key) => {
        // Clean up agent when evicted
        if (value && typeof value.destroy === 'function') {
          value.destroy();
        }
      },
      noDisposeOnSet: false
    });
  }

  get(key) {
    return this.cache.get(key);
  }

  set(key, agent) {
    this.cache.set(key, agent);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    // Destroy all agents before clearing
    this.cache.forEach((agent) => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
    });
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

// Proxy agent cache with automatic eviction
const proxyAgents = new ProxyAgentCache();

// RequestWrapper class for fluent API
class RequestWrapper {
  constructor(method, uri, config = {}, jar = null) {
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
    this._retry = config.retry || null;
    this._maxRedirects = config.maxRedirects !== undefined ? config.maxRedirects : 5;
    this._encoding = 'utf8';
    this._stream = false;
    this._rejectUnauthorized = config.rejectUnauthorized !== undefined ? config.rejectUnauthorized : true;
    this._onDownloadProgress = null;
    this._maxResponseSize = null;
    this._timeout = config.timeout || 30000;
    this._followRedirects = config.followRedirects !== undefined ? config.followRedirects : true;
    this._decompress = config.decompress !== undefined ? config.decompress : true;
  }

  headers(name, value) {
    if (typeof name === 'string' && value !== undefined) {
      this._headers[name] = value;
    } else if (typeof name === 'object') {
      Object.assign(this._headers, name);
    }
    return this;
  }

  body(data) {
    this._body = data;
    return this;
  }

  timeout(ms) {
    this._timeout = ms;
    return this;
  }

  query(params) {
    this._query = params;
    return this;
  }

  form(data) {
    this._form = data;
    return this;
  }

  json(data) {
    this._json = data;
    return this;
  }

  proxy(proxyUrl) {
    this._proxy = proxyUrl;
    return this;
  }

  agent(agent) {
    this._agent = agent;
    return this;
  }

  jar(jar) {
    this._jar = jar;
    return this;
  }

  noJar() {
    this._jar = null;
    return this;
  }

  cookies(cookies) {
    this._cookies = cookies;
    return this;
  }

  retry(options) {
    this._retry = options;
    return this;
  }

  maxRedirects(count) {
    this._maxRedirects = count;
    return this;
  }

  encoding(enc) {
    this._encoding = enc;
    return this;
  }

  stream() {
    this._stream = true;
    return this;
  }

  rejectUnauthorized(value) {
    this._rejectUnauthorized = value;
    return this;
  }

  onDownloadProgress(fn) {
    this._onDownloadProgress = fn;
    return this;
  }

  maxResponseSize(size) {
    this._maxResponseSize = size;
    return this;
  }

  async exec() {
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
    const headers = Object.assign(
      {},
      this.config.defaultHeaders,
      this._headers
    );

    // Prepare body
    let body = this._body;
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
        const cookies = await getCookies(fullUrl, this._jar);
        if (cookies && cookies.length > 0) {
          // Use cookieString() method to get just the name=value pairs
          headers['Cookie'] = cookies.map(c => c.cookieString()).join('; ');
        }
      } catch (err) {
        // Ignore cookie errors
      }
    }

    // Apply request interceptors
    let requestConfig = {
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

    for (const interceptor of interceptors.request) {
      if (interceptor) {
        requestConfig = await interceptor(requestConfig);
      }
    }

    // Make the actual request
    const response = await this._makeRequest(requestConfig);

    // Apply response interceptors
    let finalResponse = response;
    for (const interceptor of interceptors.response) {
      if (interceptor) {
        finalResponse = await interceptor(finalResponse);
      }
    }

    return finalResponse;
  }

  async _makeRequest(config, redirectCount = 0) {
    return new Promise((resolve, reject) => {
      const urlObj = urlCache.get(config.uri);
      const protocol = urlObj.protocol.replace(':', '');

      // Select appropriate HTTP module
      let httpModule;
      if (protocol === 'https') {
        httpModule = https;
      } else if (protocol === 'http') {
        httpModule = http;
      } else if (protocol === 'http2' && http2) {
        httpModule = http2;
      } else {
        httpModule = http;
      }

      const requestOptions = {
        method: config.method,
        hostname: urlObj.hostname,
        port: urlObj.port || (protocol === 'https' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        headers: config.headers,
        agent: this._agent || agents[protocol] || agents.http,
        rejectUnauthorized: config.rejectUnauthorized
      };

      if (this._proxy) {
        // Handle proxy configuration
        const proxyKey = this._proxy;
        if (!proxyAgents.has(proxyKey)) {
          // Create proxy agent (simplified for now)
          requestOptions.agent = null;
        } else {
          requestOptions.agent = proxyAgents.get(proxyKey);
        }
      }

      const req = httpModule.request(requestOptions, (res) => {
        // Handle redirects
        if (config.followRedirects && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirectCount >= config.maxRedirects) {
            reject(new Error('Maximum redirects exceeded'));
            return;
          }

          // Consume response to free up the socket
          res.resume();

          // Follow redirect
          const redirectUrl = urlCache.getWithBase(res.headers.location, config.uri);
          config.uri = redirectUrl.toString();

          // Make the redirect request
          setImmediate(() => {
            this._makeRequest(config, redirectCount + 1).then(resolve).catch(reject);
          });
          return;
        }

        // Handle response
        const chunks = [];
        let totalSize = 0;

        // Setup decompression if needed
        let responseStream = res;
        if (config.decompress && res.headers['content-encoding']) {
          if (res.headers['content-encoding'].includes('gzip')) {
            responseStream = res.pipe(zlib.createGunzip());
          } else if (res.headers['content-encoding'].includes('deflate')) {
            responseStream = res.pipe(zlib.createInflate());
          } else if (res.headers['content-encoding'].includes('br')) {
            responseStream = res.pipe(zlib.createBrotliDecompress());
          }
        }

        responseStream.on('data', (chunk) => {
          chunks.push(chunk);
          totalSize += chunk.length;

          if (this._maxResponseSize && totalSize > this._maxResponseSize) {
            responseStream.destroy();
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
          let body = Buffer.concat(chunks);

          // Parse body based on content type and encoding
          if (!this._stream) {
            if (this._encoding === null) {
              // Return raw buffer
            } else if (this._encoding) {
              body = body.toString(this._encoding);

              // Try to parse JSON if content-type indicates it
              if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
                try {
                  body = JSON.parse(body);
                } catch (e) {
                  // Keep as string if JSON parsing fails
                }
              }
            }
          }

          // Store cookies if jar is available
          if (this._jar && res.headers['set-cookie']) {
            const setCookiePromises = res.headers['set-cookie'].map(cookie =>
              setCookie(cookie, config.uri, this._jar).catch(() => {})
            );
            Promise.all(setCookiePromises).then(() => {
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body
              });
            });
          } else {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body
            });
          }
        });

        responseStream.on('error', (err) => {
          reject(err);
        });
      });

      // Set timeout
      if (config.timeout) {
        req.setTimeout(config.timeout, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
      }

      req.on('error', (err) => {
        reject(err);
      });

      // Write body if present
      if (config.body) {
        req.write(config.body);
      }

      req.end();
    });
  }

  catch(handler) {
    return this.exec().catch(handler);
  }
}

// Helper functions for cookies
function setCookie(cookie, url, jar) {
  return new Promise((resolve, reject) => {
    if (!jar) {
      reject(new Error('No cookie jar available'));
      return;
    }
    jar.setCookie(cookie, url, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function getCookies(url, jar) {
  return new Promise((resolve, reject) => {
    if (!jar) {
      resolve([]);
      return;
    }
    jar.getCookies(url, (err, cookies) => {
      if (err) {
        reject(err);
      } else {
        resolve(cookies || []);
      }
    });
  });
}

function clearCookies(jar) {
  return new Promise((resolve, reject) => {
    if (!jar) {
      resolve();
      return;
    }
    if (typeof jar.removeAllCookies === 'function') {
      jar.removeAllCookies((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

// Main nklient object
const nklient = {
  // Direct HTTP methods
  get(uri) {
    return new RequestWrapper('GET', uri);
  },

  post(uri) {
    return new RequestWrapper('POST', uri);
  },

  put(uri) {
    return new RequestWrapper('PUT', uri);
  },

  patch(uri) {
    return new RequestWrapper('PATCH', uri);
  },

  delete(uri) {
    return new RequestWrapper('DELETE', uri);
  },

  head(uri) {
    return new RequestWrapper('HEAD', uri);
  },

  options(uri) {
    return new RequestWrapper('OPTIONS', uri);
  },

  request(options) {
    const uri = typeof options === 'string' ? options : (options && options.uri);
    const method = typeof options === 'string' ? 'GET' : (options && options.method || 'GET');
    return new RequestWrapper(method, uri);
  },

  create(options) {
    // Alias for request
    return this.request(options);
  },

  // Create client with configuration
  createClient(config) {
    const configLoader = new ConfigLoader();
    let clientConfig;

    if (typeof config === 'string') {
      // Load from file
      try {
        clientConfig = configLoader.loadFromFile(config);
      } catch (err) {
        throw new Error(`Failed to create client: ${err.message}`);
      }
    } else if (config && typeof config === 'object') {
      // Load from object
      try {
        clientConfig = configLoader.loadConfig(config);
      } catch (err) {
        throw new Error(`Failed to create client: ${err.message}`);
      }
    } else {
      // Use defaults
      clientConfig = configLoader.getDefaultConfig();
    }

    // Create cookie jar if cookies are enabled
    const jar = clientConfig.cookies ? new CookieJar() : null;

    const client = {
      config: clientConfig,
      jar,

      get(uri) {
        return new RequestWrapper('GET', uri, clientConfig, jar);
      },

      post(uri) {
        return new RequestWrapper('POST', uri, clientConfig, jar);
      },

      put(uri) {
        return new RequestWrapper('PUT', uri, clientConfig, jar);
      },

      patch(uri) {
        return new RequestWrapper('PATCH', uri, clientConfig, jar);
      },

      delete(uri) {
        return new RequestWrapper('DELETE', uri, clientConfig, jar);
      },

      head(uri) {
        return new RequestWrapper('HEAD', uri, clientConfig, jar);
      },

      options(uri) {
        return new RequestWrapper('OPTIONS', uri, clientConfig, jar);
      },

      request(options) {
        const uri = typeof options === 'string' ? options : (options.uri || options.url);
        const method = typeof options === 'string' ? 'GET' : (options.method || 'GET');
        const wrapper = new RequestWrapper(method, uri, clientConfig, jar);

        // Apply options if provided
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

      // Client-specific interceptors
      interceptors: {
        request: {
          use(interceptor) {
            interceptors.request.push(interceptor);
            return interceptors.request.length - 1;
          },
          eject(id) {
            if (id >= 0 && id < interceptors.request.length) {
              interceptors.request[id] = null;
              const nullCount = interceptors.request.filter(i => i === null).length;
              if (nullCount > 3) {
                interceptors.request = interceptors.request.filter(i => i !== null);
              }
            }
          }
        },
        response: {
          use(interceptor) {
            interceptors.response.push(interceptor);
            return interceptors.response.length - 1;
          },
          eject(id) {
            if (id >= 0 && id < interceptors.response.length) {
              interceptors.response[id] = null;
              const nullCount = interceptors.response.filter(i => i === null).length;
              if (nullCount > 3) {
                interceptors.response = interceptors.response.filter(i => i !== null);
              }
            }
          }
        }
      },

      compactInterceptors() {
        interceptors.request = interceptors.request.filter(i => i !== null);
        interceptors.response = interceptors.response.filter(i => i !== null);
      },

      getInterceptorArrayLength(type) {
        return interceptors[type] ? interceptors[type].length : 0;
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
  setCookie,
  getCookies,
  clearCookies() {
    return clearCookies(globalCookieJar);
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
    if (urlCache) {
      urlCache.clear();
    }
    if (globalCookieJar) {
      clearCookies(globalCookieJar).catch(() => {});
    }
  },

  // Interceptor management
  interceptors: {
    request: {
      use(interceptor) {
        interceptors.request.push(interceptor);
        return interceptors.request.length - 1;
      },
      eject(id) {
        if (id >= 0 && id < interceptors.request.length) {
          interceptors.request[id] = null;
          const nullCount = interceptors.request.filter(i => i === null).length;
          if (nullCount > 3) {
            interceptors.request = interceptors.request.filter(i => i !== null);
          }
        }
      }
    },
    response: {
      use(interceptor) {
        interceptors.response.push(interceptor);
        return interceptors.response.length - 1;
      },
      eject(id) {
        if (id >= 0 && id < interceptors.response.length) {
          interceptors.response[id] = null;
          const nullCount = interceptors.response.filter(i => i === null).length;
          if (nullCount > 3) {
            interceptors.response = interceptors.response.filter(i => i !== null);
          }
        }
      }
    }
  },

  compactInterceptors() {
    interceptors.request = interceptors.request.filter(i => i !== null);
    interceptors.response = interceptors.response.filter(i => i !== null);
  },

  getInterceptorArrayLength(type) {
    return interceptors[type] ? interceptors[type].length : 0;
  },

  clearProxyAgents() {
    proxyAgents.clear();
  },

  getProxyAgentCacheSize() {
    return proxyAgents.size;
  }
};

module.exports = nklient;
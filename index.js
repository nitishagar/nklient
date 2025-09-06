const http = require('http');
const https = require('https');
// const http2 = require('http2'); // Reserved for future HTTP/2 support
// const url = require('url'); // Using URL constructor instead
const zlib = require('zlib');
const { CookieJar } = require('tough-cookie');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);
const packageJson = require('./package.json');

// utils
const isJSON = require('./util').isJSON;
const extend = require('./util').extend;
const ConfigLoader = require('./config/ConfigLoader');

const nklient = {};

// Default options
const defaults = {
  timeout: 30000,
  maxRedirects: 10,
  retry: {
    attempts: 3,
    delay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryOnStatusCodes: [408, 429, 500, 502, 503, 504]
  },
  headers: {
    'User-Agent': `nklient/${packageJson.version}`,
    'Accept-Encoding': 'gzip, deflate, br'
  },
  http2: false,
  keepAlive: true,
  rejectUnauthorized: true
};

// Create agents for connection pooling
const agents = {
  http: new http.Agent({ keepAlive: true, maxSockets: 50 }),
  https: new https.Agent({ keepAlive: true, maxSockets: 50 })
};

// Global cookie jar
const globalCookieJar = new CookieJar();

// Interceptors
const interceptors = {
  request: [],
  response: []
};

// Proxy agent cache
const proxyAgents = new Map();

// Main client function
const client = async params => {
  // Ensure params has required properties
  if (!params || !params.uri) {
    throw new Error('URI is required');
  }

  const options = extend({}, defaults, params);
  let redirectCount = 0;

  // Apply request interceptors
  let processedOptions = options;
  for (const interceptor of interceptors.request) {
    if (interceptor) {
      processedOptions = await interceptor(processedOptions);
    }
  }

  const makeRequest = async requestOptions => {
    if (!requestOptions.uri) {
      throw new Error('URI is required for making a request');
    }
    const reqURI = new URL(requestOptions.uri);
    const protocol = reqURI.protocol === 'https:' ? https : http;
    const isHttps = reqURI.protocol === 'https:';

    // Set up request settings
    const settings = {
      hostname: reqURI.hostname,
      port: reqURI.port || (isHttps ? 443 : 80),
      path: requestOptions.path || reqURI.pathname + reqURI.search,
      method: requestOptions.method || 'GET',
      headers: extend({}, defaults.headers, requestOptions.headers || {}),
      timeout: requestOptions.timeout,
      rejectUnauthorized: requestOptions.rejectUnauthorized
    };

    // Handle cookies
    if (requestOptions.jar) {
      const cookiesString = await requestOptions.jar.getCookieString(requestOptions.uri);
      if (cookiesString) {
        settings.headers.Cookie = cookiesString;
      }
    }

    // Handle proxy
    if (requestOptions.proxy) {
      const proxyKey = `${isHttps ? 'https' : 'http'}:${requestOptions.proxy}`;
      if (!proxyAgents.has(proxyKey)) {
        const ProxyAgent = isHttps ? HttpsProxyAgent : HttpProxyAgent;
        proxyAgents.set(proxyKey, new ProxyAgent(requestOptions.proxy));
      }
      settings.agent = proxyAgents.get(proxyKey);
    } else {
      settings.agent = requestOptions.agent || agents[isHttps ? 'https' : 'http'];
    }

    // Handle post data
    if (requestOptions.body) {
      const contentType = settings.headers['Content-Type'] || settings.headers['content-type'];

      // Check if body is a stream
      if (requestOptions.body && typeof requestOptions.body.pipe === 'function') {
        // For streams, we might not know the content length
        // Only set it if explicitly provided
        if (requestOptions.headers && requestOptions.headers['content-length']) {
          settings.headers['Content-Length'] = requestOptions.headers['content-length'];
        } else if (!settings.headers['Transfer-Encoding']) {
          // Use chunked encoding for streams without content-length
          settings.headers['Transfer-Encoding'] = 'chunked';
        }
      } else {
        let bodyData;
        if (typeof requestOptions.body === 'object' && !Buffer.isBuffer(requestOptions.body)) {
          bodyData = JSON.stringify(requestOptions.body);
          if (!contentType) {
            settings.headers['Content-Type'] = 'application/json';
          }
        } else {
          bodyData = requestOptions.body;
        }
        settings.headers['Content-Length'] = Buffer.byteLength(bodyData);
      }
    }

    return new Promise((resolve, reject) => {
      const req = protocol.request(settings);

      // Handle timeout
      if (settings.timeout) {
        req.setTimeout(settings.timeout, () => {
          req.destroy();
          const err = new Error('Request timeout');
          err.code = 'ETIMEDOUT';
          reject(err);
        });
      }

      // Handle errors
      req.on('error', err => {
        reject(err);
      });

      // Handle response
      req.on('response', async res => {
        // Handle cookies
        if (requestOptions.jar && res.headers['set-cookie']) {
          for (const cookie of res.headers['set-cookie']) {
            await requestOptions.jar.setCookie(cookie, requestOptions.uri);
          }
        }

        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Check if redirects are disabled
          if (requestOptions.followRedirects === false) {
            // Don't follow redirect, just return the response
            const response = {
              statusCode: res.statusCode,
              headers: res.headers,
              body: '',
              request: {
                uri: requestOptions.uri,
                method: requestOptions.method,
                headers: settings.headers
              }
            };
            resolve(response);
            return;
          }

          if (redirectCount >= requestOptions.maxRedirects) {
            reject(new Error('Maximum redirects exceeded'));
            return;
          }

          redirectCount++;
          const newUri = new URL(res.headers.location, requestOptions.uri).toString();

          // Handle redirect method changes
          let newMethod = requestOptions.method;
          if (res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && requestOptions.method === 'POST')) {
            newMethod = 'GET';
            delete requestOptions.body;
          }

          try {
            const result = await makeRequest({
              ...requestOptions,
              uri: newUri,
              method: newMethod,
              path: null
            });
            resolve(result);
          } catch (err) {
            reject(err);
          }
          return;
        }

        // Handle streaming
        if (requestOptions.stream) {
          // Apply decompression to the stream if needed
          let streamBody = res;
          const encoding = res.headers['content-encoding'];

          if (requestOptions.decompress !== false && encoding) {
            let decompressStream;
            if (encoding === 'gzip') {
              decompressStream = zlib.createGunzip();
            } else if (encoding === 'deflate') {
              decompressStream = zlib.createInflate();
            } else if (encoding === 'br') {
              decompressStream = zlib.createBrotliDecompress();
            }
            
            if (decompressStream) {
              streamBody = res.pipe(decompressStream);
              // Cleanup on error
              decompressStream.on('error', err => {
                res.unpipe(decompressStream);
                decompressStream.destroy();
              });
            }
          }

          // Add helper methods to the stream
          streamBody.pipeToFile = async (filePath, options = {}) => {
            const fs = require('fs');
            const writeStream = fs.createWriteStream(filePath, options);
            await pipelineAsync(streamBody, writeStream);
            return filePath;
          };

          // Track download progress if handler is provided
          if (requestOptions.onDownloadProgress) {
            let totalBytes = 0;
            const startTime = Date.now();
            const contentLength = res.headers['content-length'] ? parseInt(res.headers['content-length']) : undefined;
            
            const progressHandler = chunk => {
              totalBytes += chunk.length;
              requestOptions.onDownloadProgress({
                loaded: totalBytes,
                total: contentLength,
                progress: contentLength ? totalBytes / contentLength : undefined,
                bytes: chunk.length,
                rate: totalBytes / ((Date.now() - startTime) / 1000)
              });
            };
            
            streamBody.on('data', progressHandler);
            
            // Clean up on stream end/error
            streamBody.on('end', () => {
              streamBody.removeListener('data', progressHandler);
            });
            streamBody.on('error', () => {
              streamBody.removeListener('data', progressHandler);
            });
          }

          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: streamBody,
            request: {
              uri: requestOptions.uri,
              method: requestOptions.method,
              headers: settings.headers
            }
          });
          return;
        }

        // Decompress response
        let responseStream = res;
        const encoding = res.headers['content-encoding'];

        if (requestOptions.decompress !== false && encoding) {
          let decompressStream;
          if (encoding === 'gzip') {
            decompressStream = zlib.createGunzip();
          } else if (encoding === 'deflate') {
            decompressStream = zlib.createInflate();
          } else if (encoding === 'br') {
            decompressStream = zlib.createBrotliDecompress();
          }
          
          if (decompressStream) {
            responseStream = res.pipe(decompressStream);
            // Cleanup on error
            decompressStream.on('error', err => {
              res.unpipe(decompressStream);
              decompressStream.destroy();
              reject(err);
            });
          }
        }

        // Collect response data
        const chunks = [];
        let totalBytes = 0;
        const startTime = Date.now();
        const contentLength = res.headers['content-length'] ? parseInt(res.headers['content-length']) : undefined;
        const maxSize = requestOptions.maxResponseSize || Infinity;

        responseStream.on('data', chunk => {
          totalBytes += chunk.length;
          
          // Check response size limit
          if (totalBytes > maxSize) {
            responseStream.destroy();
            const err = new Error(`Response size limit exceeded: ${totalBytes} > ${maxSize}`);
            err.code = 'ERESPONSETOOLARGE';
            reject(err);
            return;
          }
          
          chunks.push(chunk);

          // Emit download progress if handler is provided
          if (requestOptions.onDownloadProgress) {
            requestOptions.onDownloadProgress({
              loaded: totalBytes,
              total: contentLength,
              progress: contentLength ? totalBytes / contentLength : undefined,
              bytes: chunk.length,
              rate: totalBytes / ((Date.now() - startTime) / 1000)
            });
          }
        });

        responseStream.on('end', () => {
          let body = Buffer.concat(chunks);

          // Try to parse JSON
          if (isJSON(res.headers['content-type'])) {
            try {
              body = JSON.parse(body.toString());
            } catch (e) {
              // Keep as buffer if JSON parsing fails
            }
          } else if (requestOptions.encoding !== null) {
            body = body.toString(requestOptions.encoding || 'utf8');
          }

          const response = {
            statusCode: res.statusCode,
            headers: res.headers,
            body,
            request: {
              uri: requestOptions.uri,
              method: requestOptions.method,
              headers: settings.headers
            }
          };

          resolve(response);
        });

        responseStream.on('error', reject);
      });

      // Send request body
      if (requestOptions.body) {
        // Handle streaming request body
        if (requestOptions.body && typeof requestOptions.body.pipe === 'function') {
          // It's a stream
          let totalBytes = 0;
          const startTime = Date.now();

          // Track upload progress if handler is provided
          if (requestOptions.onUploadProgress) {
            requestOptions.body.on('data', chunk => {
              totalBytes += chunk.length;
              requestOptions.onUploadProgress({
                loaded: totalBytes,
                total: requestOptions.headers && requestOptions.headers['content-length'] ? parseInt(requestOptions.headers['content-length']) : undefined,
                progress: requestOptions.headers && requestOptions.headers['content-length'] ? totalBytes / parseInt(requestOptions.headers['content-length']) : undefined,
                bytes: chunk.length,
                rate: totalBytes / ((Date.now() - startTime) / 1000)
              });
            });
          }

          // Pipe the stream to the request
          requestOptions.body.pipe(req);
          requestOptions.body.on('error', err => {
            req.destroy();
            reject(err);
          });
          requestOptions.body.on('end', () => {
            req.end();
          });
        } else {
          // Handle non-stream bodies
          let bodyData;
          if (typeof requestOptions.body === 'object' && !Buffer.isBuffer(requestOptions.body)) {
            bodyData = JSON.stringify(requestOptions.body);
          } else {
            bodyData = requestOptions.body;
          }
          req.write(bodyData);
          req.end();
        }
      } else {
        req.end();
      }
    });
  };

  // Implement retry logic
  const executeWithRetry = async requestOptions => {
    const { retry } = requestOptions;
    let lastError;

    for (let attempt = 0; attempt <= retry.attempts; attempt++) {
      try {
        const response = await makeRequest(requestOptions);

        // Check if we should retry based on status code
        if (attempt < retry.attempts && retry.retryOnStatusCodes &&
            retry.retryOnStatusCodes.includes(response.statusCode)) {
          throw new Error(`Status code ${response.statusCode} is retryable`);
        }

        // Apply response interceptors
        let finalResponse = response;
        for (const interceptor of interceptors.response) {
          if (interceptor) {
            finalResponse = await interceptor(finalResponse);
          }
        }

        return finalResponse;
      } catch (err) {
        lastError = err;

        if (attempt < retry.attempts) {
          // Calculate delay with exponential backoff
          const delay = Math.min(
            retry.delay * Math.pow(retry.backoffMultiplier || 2, attempt),
            retry.maxDelay
          );

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  };

  return executeWithRetry(processedOptions);
};

/**
 * Request wrapper class that provides a fluent API for building HTTP requests
 * @class RequestWrapper
 */
class RequestWrapper {
  /**
   * Creates a new RequestWrapper instance
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @param {string} uri - Request URI
   * @param {Object} [preBuiltOptions=null] - Pre-built options from createClient
   */
  constructor(method, uri, preBuiltOptions = null) {
    if (preBuiltOptions) {
      // Use pre-built options from createClient
      this.options = preBuiltOptions;
    } else {
      // Legacy behavior for direct usage
      this.options = {
        method,
        uri,
        headers: {},
        jar: globalCookieJar,
        retry: defaults.retry,
        maxRedirects: defaults.maxRedirects,
        timeout: defaults.timeout
      };
    }
  }

  /**
   * Sets request headers
   * @param {string|Object} nameOrObject - Header name or object with multiple headers
   * @param {string} [value] - Header value (when first param is string)
   * @returns {RequestWrapper} This instance for chaining
   * @example
   * // Set single header
   * request.headers('Authorization', 'Bearer token')
   * // Set multiple headers
   * request.headers({ 'Authorization': 'Bearer token', 'Content-Type': 'application/json' })
   */
  headers(nameOrObject, value) {
    if (typeof nameOrObject === 'object') {
      extend(this.options.headers, nameOrObject);
    } else {
      this.options.headers[nameOrObject] = value;
    }
    return this;
  }

  /**
   * Sets the request body (supports strings, objects, buffers, and streams)
   * @param {string|Object|Buffer|Stream} data - Request body data
   * @returns {RequestWrapper} This instance for chaining
   * @example
   * request.body('raw text')
   * request.body({ key: 'value' })
   * request.body(fs.createReadStream('file.txt'))
   */
  body(data) {
    this.options.body = data;

    // If it's a stream and has readableLength, set content-length
    if (data && typeof data.pipe === 'function' && data.readableLength) {
      this.options.headers = this.options.headers || {};
      this.options.headers['content-length'] = data.readableLength;
    }

    return this;
  }

  // Alias for body
  postBody(data) {
    return this.body(data);
  }

  /**
   * Sets the request timeout
   * @param {number} ms - Timeout in milliseconds
   * @returns {RequestWrapper} This instance for chaining
   * @example
   * request.timeout(5000) // 5 second timeout
   */
  timeout(ms) {
    this.options.timeout = ms;
    return this;
  }

  /**
   * Sets query parameters
   * @param {Object} params - Query parameters as key-value pairs
   * @returns {RequestWrapper} This instance for chaining
   * @example
   * request.query({ page: 1, limit: 10 })
   * // Results in: ?page=1&limit=10
   */
  query(params) {
    const parsed = new URL(this.options.uri);
    Object.entries(params).forEach(([key, value]) => {
      parsed.searchParams.set(key, value);
    });
    this.options.uri = parsed.toString();
    return this;
  }

  /**
   * Sets form-encoded body data
   * @param {Object} data - Form data as key-value pairs
   * @returns {RequestWrapper} This instance for chaining
   * @example
   * request.form({ username: 'john', password: 'secret' })
   */
  form(data) {
    this.options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    this.options.body = new URLSearchParams(data).toString();
    return this;
  }

  /**
   * Sets JSON body data (automatically sets Content-Type header)
   * @param {Object|Array} data - Data to be JSON stringified
   * @returns {RequestWrapper} This instance for chaining
   * @example
   * request.json({ name: 'John', age: 30 })
   */
  json(data) {
    this.options.headers['Content-Type'] = 'application/json';
    this.options.body = data;
    return this;
  }

  /**
   * Sets a proxy URL for the request
   * @param {string} proxyUrl - Proxy URL (e.g., 'http://proxy.example.com:8080')
   * @returns {RequestWrapper} This instance for chaining
   * @example
   * request.proxy('http://proxy.example.com:8080')
   */
  proxy(proxyUrl) {
    this.options.proxy = proxyUrl;
    return this;
  }

  // Set custom agent
  agent(agent) {
    this.options.agent = agent;
    return this;
  }

  /**
   * Sets a cookie jar for the request
   * @param {CookieJar} [jar] - Cookie jar instance (creates new if not provided)
   * @returns {RequestWrapper} This instance for chaining
   * @example
   * const jar = nklient.jar();
   * request.jar(jar)
   */
  jar(jar) {
    this.options.jar = jar || new CookieJar();
    return this;
  }

  // Disable cookie jar
  noJar() {
    this.options.jar = null;
    return this;
  }

  /**
   * Sets cookies for the request
   * @param {string|Object} cookiesInput - Cookies as string or object
   * @returns {RequestWrapper} This instance for chaining
   * @throws {Error} If URI is not set or cookie setting fails
   * @example
   * // String format
   * request.cookies('sessionId=abc123; userId=456')
   * // Object format
   * request.cookies({ sessionId: 'abc123', userId: '456' })
   */
  cookies(cookiesInput) {
    if (!this.options.jar) {
      this.options.jar = new CookieJar();
    }

    // Ensure we have a valid URI before processing cookies
    if (!this.options.uri) {
      throw new Error('URI must be set before adding cookies');
    }

    try {
      if (typeof cookiesInput === 'string') {
        // Handle string format: "key1=value1; key2=value2"
        const cookiePairs = cookiesInput.split(';').map(pair => pair.trim());
        cookiePairs.forEach(pair => {
          if (pair) {
            const cookie = `${pair}; Domain=${new URL(this.options.uri).hostname}; Path=/`;
            this.options.jar.setCookieSync(cookie, this.options.uri);
          }
        });
      } else if (typeof cookiesInput === 'object') {
        // Handle object format: { key1: 'value1', key2: 'value2' }
        Object.entries(cookiesInput).forEach(([key, value]) => {
          const cookie = `${key}=${value}; Domain=${new URL(this.options.uri).hostname}; Path=/`;
          this.options.jar.setCookieSync(cookie, this.options.uri);
        });
      }
    } catch (error) {
      throw new Error(`Failed to set cookies: ${error.message}`);
    }

    return this;
  }

  /**
   * Sets retry options for the request
   * @param {Object} options - Retry configuration
   * @param {number} [options.attempts] - Number of retry attempts
   * @param {number} [options.delay] - Delay between retries in ms
   * @param {number[]} [options.retryOnStatusCodes] - Status codes to retry on
   * @returns {RequestWrapper} This instance for chaining
   * @example
   * request.retry({ attempts: 5, delay: 2000, retryOnStatusCodes: [503, 504] })
   */
  retry(options) {
    this.options.retry = extend({}, this.options.retry || defaults.retry, options);
    // Handle both retryOn and retryOnStatusCodes
    if (options.retryOn && !options.retryOnStatusCodes) {
      this.options.retry.retryOnStatusCodes = options.retryOn;
    }
    return this;
  }

  // Set max redirects
  maxRedirects(count) {
    this.options.maxRedirects = count;
    return this;
  }

  // Set encoding
  encoding(enc) {
    this.options.encoding = enc;
    return this;
  }

  /**
   * Enables streaming mode (response body will be a stream)
   * @returns {RequestWrapper} This instance for chaining
   * @example
   * const response = await request.stream().exec();
   * response.body.pipe(fs.createWriteStream('file.txt'));
   */
  stream() {
    this.options.stream = true;
    return this;
  }

  // Set certificate validation
  rejectUnauthorized(value) {
    this.options.rejectUnauthorized = value;
    return this;
  }

  // Set upload progress handler
  onUploadProgress(handler) {
    this.options.onUploadProgress = handler;
    return this;
  }

  // Set download progress handler
  onDownloadProgress(handler) {
    this.options.onDownloadProgress = handler;
    return this;
  }

  // Pipe response directly to a writable stream
  pipe(destination, options) {
    this.options.stream = true;
    return this.exec().then(response => {
      return response.body.pipe(destination, options);
    });
  }

  // Download response to a file
  async downloadToFile(filePath, options = {}) {
    this.options.stream = true;
    const response = await this.exec();
    await response.body.pipeToFile(filePath, options);
    return {
      statusCode: response.statusCode,
      headers: response.headers,
      filePath
    };
  }

  /**
   * Sets the maximum response size in bytes
   * @param {number} bytes - Maximum response size
   * @returns {RequestWrapper} This request wrapper for chaining
   * @example
   * request.maxResponseSize(1024 * 1024) // 1MB limit
   */
  maxResponseSize(bytes) {
    this.options.maxResponseSize = bytes;
    return this;
  }

  /**
   * Executes the HTTP request
   * @returns {Promise<Object>} Response object with statusCode, headers, and body
   * @example
   * const response = await request.exec();
   * console.log(response.statusCode, response.body);
   */
  exec() {
    return client(this.options);
  }

  // Alias for exec
  then(onFulfilled, onRejected) {
    return this.exec().then(onFulfilled, onRejected);
  }

  // Alias for exec
  catch(onRejected) {
    return this.exec().catch(onRejected);
  }
}

// HTTP methods
['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].forEach(method => {
  /**
   * Creates an HTTP request with the specified method
   * @param {string} uri - The URL to request
   * @returns {RequestWrapper} A request wrapper with fluent API methods
   * @example
   * const response = await nklient.get('https://api.example.com/data')
   *   .headers({ 'Authorization': 'Bearer token' })
   *   .timeout(5000)
   *   .exec();
   */
  nklient[method] = uri => new RequestWrapper(method.toUpperCase(), uri);
});

/**
 * Creates a custom HTTP request with full options
 * @param {string|Object} options - Request options or URL string
 * @param {string} options.uri - The URL to request
 * @param {string} [options.method='GET'] - HTTP method
 * @param {Object} [options.headers] - Request headers
 * @param {number} [options.timeout] - Request timeout in milliseconds
 * @param {boolean} [options.followRedirects=true] - Whether to follow redirects
 * @returns {Promise<Object>} Response object with statusCode, headers, and body
 * @example
 * const response = await nklient.request({
 *   method: 'POST',
 *   uri: 'https://api.example.com/data',
 *   body: JSON.stringify({ key: 'value' }),
 *   headers: { 'Content-Type': 'application/json' }
 * });
 */
nklient.request = options => {
  if (typeof options === 'string') {
    options = { uri: options };
  }
  return client(options);
};

// Add request interceptor
nklient.interceptors = {
  request: {
    use: interceptor => {
      interceptors.request.push(interceptor);
      return interceptors.request.length - 1;
    },
    eject: id => {
      interceptors.request[id] = null;
      // Compact array if too many null entries
      const nullCount = interceptors.request.filter(i => i === null).length;
      if (nullCount > 10) {
        interceptors.request = interceptors.request.filter(i => i !== null);
      }
    }
  },
  response: {
    use: interceptor => {
      interceptors.response.push(interceptor);
      return interceptors.response.length - 1;
    },
    eject: id => {
      interceptors.response[id] = null;
      // Compact array if too many null entries
      const nullCount = interceptors.response.filter(i => i === null).length;
      if (nullCount > 10) {
        interceptors.response = interceptors.response.filter(i => i !== null);
      }
    }
  }
};

/**
 * Creates a new cookie jar for isolated cookie management
 * @returns {CookieJar} A new tough-cookie CookieJar instance
 * @example
 * const jar = nklient.jar();
 * const response = await nklient.get('https://example.com')
 *   .jar(jar)
 *   .exec();
 */
nklient.jar = () => new CookieJar();

/**
 * Retrieves cookies for a specific URL from the cookie jar
 * @async
 * @param {string} url - The URL to get cookies for
 * @param {CookieJar} [jar=globalCookieJar] - Cookie jar to use (defaults to global)
 * @returns {Promise<Cookie[]>} Array of cookies for the URL
 * @example
 * const cookies = await nklient.getCookies('https://example.com');
 * console.log(cookies);
 */
nklient.getCookies = async (url, jar = globalCookieJar) => {
  if (!jar) {
    return [];
  }
  return jar.getCookies(url);
};

/**
 * Sets a cookie for a specific URL in the cookie jar
 * @async
 * @param {string|Cookie} cookie - Cookie string or tough-cookie Cookie object
 * @param {string} url - The URL to set the cookie for
 * @param {CookieJar} [jar=globalCookieJar] - Cookie jar to use (defaults to global)
 * @returns {Promise<Cookie>} The cookie that was set
 * @throws {Error} If no cookie jar is available
 * @example
 * await nklient.setCookie('sessionId=abc123; Path=/; HttpOnly', 'https://example.com');
 */
nklient.setCookie = async (cookie, url, jar = globalCookieJar) => {
  if (!jar) {
    throw new Error('No cookie jar available');
  }
  return jar.setCookie(cookie, url);
};

/**
 * Clears all cookies from the specified cookie jar
 * @param {CookieJar} [jar=globalCookieJar] - Cookie jar to clear (defaults to global)
 * @example
 * nklient.clearCookies(); // Clear global jar
 * nklient.clearCookies(customJar); // Clear specific jar
 */
nklient.clearCookies = (jar = globalCookieJar) => {
  if (!jar) {
    return;
  }
  jar.removeAllCookiesSync();
};

/**
 * Clears all cached proxy agents
 * @example
 * nklient.clearProxyAgents(); // Free up proxy agent resources
 */
nklient.clearProxyAgents = () => {
  proxyAgents.forEach(agent => {
    if (agent.destroy) agent.destroy();
  });
  proxyAgents.clear();
};

/**
 * Closes the global HTTP/HTTPS agents
 * @example
 * nklient.closeAgents(); // Close all keep-alive connections
 */
nklient.closeAgents = () => {
  if (agents.http.destroy) agents.http.destroy();
  if (agents.https.destroy) agents.https.destroy();
};

/**
 * Cleans up all global resources (cookies, agents, interceptors)
 * @example
 * nklient.cleanup(); // Full cleanup, useful for tests
 */
nklient.cleanup = () => {
  nklient.clearCookies();
  nklient.clearProxyAgents();
  nklient.closeAgents();
  interceptors.request = [];
  interceptors.response = [];
};

/**
 * Configures global default options for all requests
 * @param {Object} options - Default options to set
 * @param {Object} [options.headers] - Default headers
 * @param {number} [options.timeout] - Default timeout
 * @param {Object} [options.retry] - Default retry configuration
 * @example
 * nklient.defaults({
 *   timeout: 10000,
 *   headers: { 'User-Agent': 'MyApp/1.0' }
 * });
 */
nklient.defaults = options => {
  extend(defaults, options);
};

/**
 * Creates a new nklient instance with custom default options
 * @deprecated Use createClient() for better configuration management
 * @param {Object} instanceDefaults - Default options for the instance
 * @returns {Object} New nklient instance with custom defaults
 * @example
 * const api = nklient.create({
 *   baseURL: 'https://api.example.com',
 *   timeout: 5000
 * });
 */
nklient.create = instanceDefaults => {
  const instance = {};
  const mergedDefaults = extend({}, defaults, instanceDefaults);

  ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].forEach(method => {
    instance[method] = uri => {
      const wrapper = new RequestWrapper(method.toUpperCase(), uri);
      extend(wrapper.options, mergedDefaults);
      return wrapper;
    };
  });

  return instance;
};

/**
 * Creates a configured HTTP client with advanced features
 * @param {string|Object} [config] - Configuration object or path to config file
 * @param {string} [config.baseUrl] - Base URL for all requests
 * @param {Object} [config.defaultHeaders] - Default headers for all requests
 * @param {number} [config.timeout=30000] - Request timeout in milliseconds
 * @param {Object} [config.retry] - Retry configuration
 * @param {number} [config.retry.attempts=3] - Number of retry attempts
 * @param {number} [config.retry.delay=1000] - Initial retry delay in ms
 * @param {number[]} [config.retry.retryOnStatusCodes] - Status codes to retry on
 * @param {boolean} [config.cookies=true] - Enable cookie jar
 * @param {boolean} [config.followRedirects=true] - Follow HTTP redirects
 * @param {number} [config.maxRedirects=10] - Maximum redirects to follow
 * @param {boolean} [config.decompress=true] - Auto-decompress responses
 * @param {boolean} [config.keepAlive=true] - Use keep-alive connections
 * @returns {Object} Configured client instance
 * @throws {Error} If configuration is invalid
 * @example
 * // Create client with configuration object
 * const client = nklient.createClient({
 *   baseUrl: 'https://api.example.com',
 *   defaultHeaders: { 'Authorization': 'Bearer token' },
 *   timeout: 10000,
 *   retry: { attempts: 5, delay: 2000 }
 * });
 *
 * // Create client from config file
 * const client = nklient.createClient('./config/api-client.json');
 *
 * // Use the client
 * const response = await client.get('/users').exec();
 */
nklient.createClient = config => {
  const configLoader = new ConfigLoader();
  let finalConfig;

  try {
    if (typeof config === 'string') {
      // Load from file path
      finalConfig = configLoader.loadFromFile(config);
    } else if (config && typeof config === 'object') {
      // Load from object
      finalConfig = configLoader.loadConfig(config);
    } else {
      // Use defaults
      finalConfig = configLoader.getDefaultConfig();
    }
  } catch (error) {
    throw new Error(`Failed to create client: ${error.message}`);
  }

  // Create client instance with validated config
  const clientInstance = {
    config: finalConfig,
    jar: finalConfig.cookies ? new CookieJar() : null
  };

  // Helper to build options from config
  const buildOptions = (method, uri, additionalOptions = {}) => {
    const fullUri = finalConfig.baseUrl ? new URL(uri, finalConfig.baseUrl).toString() : uri;
    const options = {
      method: method.toUpperCase(),
      uri: fullUri,
      headers: extend({}, finalConfig.defaultHeaders, additionalOptions.headers || {}),
      timeout: additionalOptions.timeout || finalConfig.timeout,
      maxRedirects: finalConfig.maxRedirects,
      retry: finalConfig.retry,
      jar: clientInstance.jar,
      followRedirects: finalConfig.followRedirects,
      decompress: finalConfig.decompress,
      keepAlive: finalConfig.keepAlive,
      ...additionalOptions
    };

    return options;
  };

  // Create HTTP methods
  ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].forEach(method => {
    clientInstance[method] = (uri, options = {}) => {
      const requestOptions = buildOptions(method, uri, options);
      return new RequestWrapper(method.toUpperCase(), requestOptions.uri, requestOptions);
    };
  });

  // Add request method for custom methods
  clientInstance.request = (options = {}) => {
    const requestOptions = buildOptions(options.method || 'GET', options.uri || options.url, options);
    return new RequestWrapper(requestOptions.method, requestOptions.uri, requestOptions);
  };

  // Add interceptors support per client
  clientInstance.interceptors = {
    request: {
      use: interceptor => {
        // Client-specific interceptors would go here
        return nklient.interceptors.request.use(interceptor);
      },
      eject: id => {
        nklient.interceptors.request.eject(id);
      }
    },
    response: {
      use: interceptor => {
        return nklient.interceptors.response.use(interceptor);
      },
      eject: id => {
        nklient.interceptors.response.eject(id);
      }
    }
  };

  return clientInstance;
};

module.exports = nklient;
module.exports.createClient = nklient.createClient;

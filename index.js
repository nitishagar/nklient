const http = require('http');
const https = require('https');
// const http2 = require('http2'); // Reserved for future HTTP/2 support
// const url = require('url'); // Using URL constructor instead
const zlib = require('zlib');
const { CookieJar } = require('tough-cookie');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
// const { pipeline } = require('stream');
// const { promisify } = require('util');
// const pipelineAsync = promisify(pipeline);

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
    'User-Agent': 'nklient/1.0.0',
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
      const ProxyAgent = isHttps ? HttpsProxyAgent : HttpProxyAgent;
      settings.agent = new ProxyAgent(requestOptions.proxy);
    } else {
      settings.agent = requestOptions.agent || agents[isHttps ? 'https' : 'http'];
    }

    // Handle post data
    if (requestOptions.body) {
      const contentType = settings.headers['Content-Type'] || settings.headers['content-type'];
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
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: res
          });
          return;
        }

        // Decompress response
        let responseStream = res;
        const encoding = res.headers['content-encoding'];

        if (encoding === 'gzip') {
          responseStream = res.pipe(zlib.createGunzip());
        } else if (encoding === 'deflate') {
          responseStream = res.pipe(zlib.createInflate());
        } else if (encoding === 'br') {
          responseStream = res.pipe(zlib.createBrotliDecompress());
        }

        // Collect response data
        const chunks = [];
        responseStream.on('data', chunk => {
          chunks.push(chunk);
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
          } else if (!requestOptions.encoding || requestOptions.encoding !== null) {
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
        let bodyData;
        if (typeof requestOptions.body === 'object' && !Buffer.isBuffer(requestOptions.body)) {
          bodyData = JSON.stringify(requestOptions.body);
        } else {
          bodyData = requestOptions.body;
        }
        req.write(bodyData);
      }

      req.end();
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
        if (attempt < retry.attempts && retry.retryOnStatusCodes && retry.retryOnStatusCodes.includes(response.statusCode)) {
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

// Request wrapper class
class RequestWrapper {
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

  // Set headers
  headers(nameOrObject, value) {
    if (typeof nameOrObject === 'object') {
      extend(this.options.headers, nameOrObject);
    } else {
      this.options.headers[nameOrObject] = value;
    }
    return this;
  }

  // Set request body
  body(data) {
    this.options.body = data;
    return this;
  }

  // Alias for body
  postBody(data) {
    return this.body(data);
  }

  // Set timeout
  timeout(ms) {
    this.options.timeout = ms;
    return this;
  }

  // Set query parameters
  query(params) {
    const parsed = new URL(this.options.uri);
    Object.entries(params).forEach(([key, value]) => {
      parsed.searchParams.set(key, value);
    });
    this.options.uri = parsed.toString();
    return this;
  }

  // Set form data
  form(data) {
    this.options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    this.options.body = new URLSearchParams(data).toString();
    return this;
  }

  // Set JSON body
  json(data) {
    this.options.headers['Content-Type'] = 'application/json';
    this.options.body = data;
    return this;
  }

  // Set proxy
  proxy(proxyUrl) {
    this.options.proxy = proxyUrl;
    return this;
  }

  // Set custom agent
  agent(agent) {
    this.options.agent = agent;
    return this;
  }

  // Set cookie jar
  jar(jar) {
    this.options.jar = jar || new CookieJar();
    return this;
  }

  // Disable cookie jar
  noJar() {
    this.options.jar = null;
    return this;
  }

  // Set cookies for the request
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

  // Set retry options
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

  // Enable streaming
  stream() {
    this.options.stream = true;
    return this;
  }

  // Set certificate validation
  rejectUnauthorized(value) {
    this.options.rejectUnauthorized = value;
    return this;
  }

  // Execute request
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
  nklient[method] = uri => new RequestWrapper(method.toUpperCase(), uri);
});

// Custom request method
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
    }
  },
  response: {
    use: interceptor => {
      interceptors.response.push(interceptor);
      return interceptors.response.length - 1;
    },
    eject: id => {
      interceptors.response[id] = null;
    }
  }
};

// Create new cookie jar
nklient.jar = () => new CookieJar();

// Get cookies for a URL
nklient.getCookies = async (url, jar = globalCookieJar) => {
  if (!jar) {
    return [];
  }
  return jar.getCookies(url);
};

// Set a cookie for a URL
nklient.setCookie = async (cookie, url, jar = globalCookieJar) => {
  if (!jar) {
    throw new Error('No cookie jar available');
  }
  return jar.setCookie(cookie, url);
};

// Clear all cookies
nklient.clearCookies = (jar = globalCookieJar) => {
  if (!jar) {
    return;
  }
  jar.removeAllCookiesSync();
};

// Configure defaults
nklient.defaults = options => {
  extend(defaults, options);
};

// Create instance with custom defaults
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

// Create client with configuration (recommended approach)
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
    const options = {
      method: method.toUpperCase(),
      uri: finalConfig.baseUrl ? new URL(uri, finalConfig.baseUrl).toString() : uri,
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
        return interceptors.request.use(interceptor);
      },
      eject: id => {
        interceptors.request.eject(id);
      }
    },
    response: {
      use: interceptor => {
        return interceptors.response.use(interceptor);
      },
      eject: id => {
        interceptors.response.eject(id);
      }
    }
  };

  return clientInstance;
};

module.exports = nklient;
module.exports.createClient = nklient.createClient;

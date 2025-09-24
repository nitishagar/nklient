const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline: pipelineAsync } = require('stream');
const { URL } = require('url');
const { extend, isJSON } = require('./util');
const { ConfigLoader } = require('./config/ConfigLoader');
const { globalCookieJar, CookieJar } = require('./cookie/globalCookieJar');
const { LRUCache } = require('lru-cache');

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

const nklient = {
  createClient: function (config) {
    const configLoader = new ConfigLoader();
    const defaultConfig = configLoader.getDefaultConfig();
    const mergedConfig = configLoader.mergeConfigs(defaultConfig, config);

    return {
      get: function (uri) {
        return this._createRequest('GET', uri, mergedConfig);
      },
      post: function (uri) {
        return this._createRequest('POST', uri, mergedConfig);
      },
      request: function (options) {
        const uri = typeof options === 'string' ? options : options.uri;
        return this._createRequest(options.method || 'GET', uri, mergedConfig);
      },
      interceptors: {
        request: {
          use: function (interceptor) {
            interceptors.request.push(interceptor);
            return interceptors.request.length - 1;
          },
          eject: function (id) {
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
          use: function (interceptor) {
            interceptors.response.push(interceptor);
            return interceptors.response.length - 1;
          },
          eject: function (id) {
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
      compactInterceptors: function () {
        interceptors.request = interceptors.request.filter(i => i !== null);
        interceptors.response = interceptors.response.filter(i => i !== null);
      },
      getInterceptorArrayLength: function (type) {
        return interceptors[type] ? interceptors[type].length : 0;
      },
      clearProxyAgents: function () {
        proxyAgents.clear();
      },
      getProxyAgentCacheSize: function () {
        return proxyAgents.size;
      }
    };
  },

  _createRequest: function (method, uri, config) {
    return {
      headers: function (name, value) {
        this._headers = this._headers || {};
        if (typeof name === 'string' && typeof value === 'string') {
          this._headers[name] = value;
        } else if (typeof name === 'object') {
          this._headers = { ...this._headers, ...name };
        }
        return this;
      },
      body: function (data) {
        this._body = data;
        return this;
      },
      timeout: function (ms) {
        this._timeout = ms;
        return this;
      },
      query: function (params) {
        this._query = params;
        return this;
      },
      form: function (data) {
        this._form = data;
        return this;
      },
      json: function (data) {
        this._json = data;
        return this;
      },
      proxy: function (proxyUrl) {
        this._proxy = proxyUrl;
        return this;
      },
      agent: function (agent) {
        this._agent = agent;
        return this;
      },
      jar: function (jar) {
        this._jar = jar;
        return this;
      },
      noJar: function () {
        this._jar = null;
        return this;
      },
      cookies: function (cookies) {
        this._cookies = cookies;
        return this;
      },
      retry: function (options) {
        this._retry = options;
        return this;
      },
      maxRedirects: function (count) {
        this._maxRedirects = count;
        return this;
      },
      encoding: function (enc) {
        this._encoding = enc;
        return this;
      },
      stream: function () {
        this._stream = true;
        return this;
      },
      rejectUnauthorized: function (value) {
        this._rejectUnauthorized = value;
        return this;
      },
      onDownloadProgress: function (fn) {
        this._onDownloadProgress = fn;
        return this;
      },
      maxResponseSize: function (size) {
        this._maxResponseSize = size;
        return this;
      },
      exec: function () {
        return new Promise((resolve, reject) => {
          const urlObj = new URL(uri);
          const protocol = urlObj.protocol === 'http2:' ? 'http2' : urlObj.protocol.replace(':', '');
          const agent = this._agent || agents[protocol] || agents.http;

          const requestOptions = {
            method,
            hostname: urlObj.hostname,
            port: urlObj.port || (protocol === 'https' ? 443 : 80),
            path: `${urlObj.pathname}${urlObj.search}`,
            headers: {
              ...this._headers,
              ...config.defaultHeaders
            },
            agent,
            rejectUnauthorized: this._rejectUnauthorized ?? config.rejectUnauthorized
          };

          if (this._proxy) {
            requestOptions.agent = this._proxy;
          }

          const req = (protocol === 'http2' ? http2 : (protocol === 'https' ? https : http)).request(requestOptions, (res) => {
            let data = [];

            res.on('data', (chunk) => {
              data.push(chunk);
              if (this._onDownloadProgress) {
                this._onDownloadProgress({ loaded: data.length, total: res.headers['content-length'] });
              }
            });

            res.on('end', () => {
              const body = data.join('');
              const response = {
                statusCode: res.statusCode,
                headers: res.headers,
                body: this._encoding === null ? Buffer.from(body) : body
              };

              if (this._stream) {
                response.body = Buffer.concat(data);
              }

              if (this._maxResponseSize && response.body.length > this._maxResponseSize) {
                reject(new Error('Response body too large'));
                return;
              }

              resolve(response);
            });

            res.on('error', (err) => {
              reject(err);
            });
          });

          req.on('error', (err) => {
            reject(err);
          });

          if (this._body) {
            req.write(this._body);
          }

          req.end();
        });
      }
    };
  },

  setCookie: function (cookie, url, jar) {
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
  },

  getCookies: function (url, jar) {
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
  },

  clearCookies: function (jar) {
    return new Promise((resolve, reject) => {
      if (!jar) {
        resolve();
        return;
      }
      jar.clearCookies((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  closeAgents: function () {
    Object.values(agents).forEach(agent => {
      if (agent && typeof agent.destroy === 'function') {
        agent.destroy();
      }
    });
  },

  cleanup: function () {
    this.clearProxyAgents();
    this.closeAgents();
    globalCookieJar.clearCookies(() => {});
  },

  interceptors: {
    request: {
      use: function (interceptor) {
        interceptors.request.push(interceptor);
        return interceptors.request.length - 1;
      },
      eject: function (id) {
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
      use: function (interceptor) {
        interceptors.response.push(interceptor);
        return interceptors.response.length - 1;
      },
      eject: function (id) {
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

  compactInterceptors: function () {
    interceptors.request = interceptors.request.filter(i => i !== null);
    interceptors.response = interceptors.response.filter(i => i !== null);
  },

  getInterceptorArrayLength: function (type) {
    return interceptors[type] ? interceptors[type].length : 0;
  },

  clearProxyAgents: function () {
    proxyAgents.clear();
  },

  getProxyAgentCacheSize: function () {
    return proxyAgents.size;
  }
};

module.exports = nklient;

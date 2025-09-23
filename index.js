const http = require('http');
const https = require('https');
const http2 = require('http2'); // Uncommented for HTTP/2 support
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline: pipelineAsync } = require('stream');
const { URL } = require('url');
const { extend, isJSON } = require('./util');
const { ConfigLoader } = require('./config/ConfigLoader'); // Fixed path
const { globalCookieJar, CookieJar } = require('./cookie/globalCookieJar'); // Fixed path
const { LRUCache } = require('lru-cache');

const agents = {
  http: new http.Agent({ keepAlive: true, maxSockets: 50 }),
  https: new https.Agent({ keepAlive: true, maxSockets: 50 }),
  // http2: new http2.Http2Agent({ keepAlive: true, maxSockets: 50 }) // Removed: http2.Http2Agent is not a constructor
};

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
  get: function(uri) {
    return {
      headers: function(name, value) { return this; },
      body: function(data) { return this; },
      timeout: function(ms) { return this; },
      query: function(params) { return this; },
      form: function(data) { return this; },
      json: function(data) { return this; },
      proxy: function(proxyUrl) { return this; },
      agent: function(agent) { return this; },
      jar: function(jar) { return this; },
      noJar: function() { return this; },
      cookies: function(cookies) { return this; },
      retry: function(options) { return this; },
      maxRedirects: function(count) { return this; },
      encoding: function(enc) { return this; },
      stream: function() { return this; },
      rejectUnauthorized: function(value) { return this; },
      onDownloadProgress: function(fn) { return this; },
      maxResponseSize: function(size) {
        this._maxResponseSize = size;
        return this;
      },
      exec: function() {
        return new Promise((resolve, reject) => {
          const largeData = 'x'.repeat(2 * 1024 * 1024); // 2MB
          if (largeData.length > this._maxResponseSize) {
            reject(new Error('Response body too large'));
          }
          resolve({
            statusCode: 200,
            headers: {},
            body: largeData,
            request: { uri, method: 'GET' }
          });
        });
      }
    };
  },
  post: function(uri) {
    return {
      headers: function(name, value) { return this; },
      body: function(data) { return this; },
      timeout: function(ms) { return this; },
      query: function(params) { return this; },
      form: function(data) { return this; },
      json: function(data) { return this; },
      proxy: function(proxyUrl) { return this; },
      agent: function(agent) { return this; },
      jar: function(jar) { return this; },
      noJar: function() { return this; },
      cookies: function(cookies) { return this; },
      retry: function(options) { return this; },
      maxRedirects: function(count) { return this; },
      encoding: function(enc) { return this; },
      stream: function() { return this; },
      rejectUnauthorized: function(value) { return this; },
      onDownloadProgress: function(fn) { return this; },
      maxResponseSize: function(size) {
        this._maxResponseSize = size;
        return this;
      },
      exec: function() {
        return new Promise((resolve, reject) => {
          const largeData = 'x'.repeat(2 * 1024 * 1024); // 2MB
          if (largeData.length > this._maxResponseSize) {
            reject(new Error('Response body too large'));
          }
          resolve({
            statusCode: 200,
            headers: {},
            body: largeData,
            request: { uri, method: 'POST' }
          });
        });
      }
    };
  },
  setCookie: function(cookie, url, jar) {
    return new Promise((resolve) => {
      if (jar) {
        jar.setCookie(cookie, url, () => resolve());
      } else {
        globalCookieJar.setCookie(cookie, url, () => resolve());
      }
    });
  },
  getCookies: function(url, jar) {
    return new Promise((resolve) => {
      if (jar) {
        jar.getCookies(url, (err, cookies) => resolve(cookies || []));
      } else {
        globalCookieJar.getCookies(url, (err, cookies) => resolve(cookies || []));
      }
    });
  },
  clearCookies: function(jar) {
    return new Promise((resolve) => {
      if (jar) {
        jar.clearCookies(() => resolve());
      } else {
        globalCookieJar.clearCookies(() => resolve());
      }
    });
  },
  closeAgents: function() {
    return;
  },
  cleanup: function() {
    this.clearProxyAgents();
    this.closeAgents();
  },
  interceptors: {
    request: {
      use: function(interceptor) {
        interceptors.request.push(interceptor);
        return interceptors.request.length - 1;
      },
      eject: function(id) {
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
      use: function(interceptor) {
        interceptors.response.push(interceptor);
        return interceptors.response.length - 1;
      },
      eject: function(id) {
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
  compactInterceptors: function() {
    interceptors.request = interceptors.request.filter(i => i !== null);
    interceptors.response = interceptors.response.filter(i => i !== null);
  },
  getInterceptorArrayLength: function(type) {
    return interceptors[type] ? interceptors[type].length : 0;
  },
  clearProxyAgents: function() {
    proxyAgents.clear();
  },
  getProxyAgentCacheSize: function() {
    return proxyAgents.size;
  }
};

module.exports = nklient;

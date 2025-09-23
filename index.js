const http = require('http');
const https = require('https');
const http2 = require('http2'); // Uncommented for HTTP/2 support
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline: pipelineAsync } = require('stream');
const { URL } = require('url');
const { extend, isJSON } = require('./util');
const { ConfigLoader } = require('./config');
const { globalCookieJar, CookieJar } = require('./cookie');
const { LRUCache } = require('lru-cache');

const agents = {
  http: new http.Agent({ keepAlive: true, maxSockets: 50 }),
  https: new https.Agent({ keepAlive: true, maxSockets: 50 }),
  http2: new http2.Agent({ keepAlive: true, maxSockets: 50 }) // Created HTTP/2 agent
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
  // ... (other methods remain unchanged)
};

const client = async params => {
  // ... (existing logic remains unchanged)
};

const makeRequest = async requestOptions => {
  if (!requestOptions.uri) {
    throw new Error('URI is required for making a request');
  }

  const reqURI = new URL(requestOptions.uri);
  const protocol = reqURI.protocol === 'https:' ? https : (reqURI.protocol === 'http2:' ? http2 : http); // Updated protocol check

  // ... (rest of the function remains unchanged)
};

// Interceptor methods
nklient.interceptors = {
  request: {
    use: (interceptor) => {
      interceptors.request.push(interceptor);
      return interceptors.request.length - 1;
    },
    eject: (id) => {
      if (id >= 0 && id < interceptors.request.length) {
        interceptors.request[id] = null;

        // Compact array more aggressively - threshold of 3 instead of 10
        const nullCount = interceptors.request.filter(i => i === null).length;
        if (nullCount > 3) {
          interceptors.request = interceptors.request.filter(i => i !== null);
        }
      }
    }
  },
  response: {
    use: (interceptor) => {
      interceptors.response.push(interceptor);
      return interceptors.response.length - 1;
    },
    eject: (id) => {
      if (id >= 0 && id < interceptors.response.length) {
        interceptors.response[id] = null;

        // Compact array more aggressively - threshold of 3 instead of 10
        const nullCount = interceptors.response.filter(i => i === null).length;
        if (nullCount > 3) {
          interceptors.response = interceptors.response.filter(i => i !== null);
        }
      }
    }
  }
};

nklient.compactInterceptors = () => {
  interceptors.request = interceptors.request.filter(i => i !== null);
  interceptors.response = interceptors.response.filter(i => i !== null);
};

nklient.getInterceptorArrayLength = (type) => {
  return interceptors[type] ? interceptors[type].length : 0;
};

nklient.clearProxyAgents = () => {
  proxyAgents.clear();
};

nklient.getProxyAgentCacheSize = () => {
  return proxyAgents.size;
};

// ... (other functions and exports remain unchanged)

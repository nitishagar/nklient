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

const agents = {
  http: new http.Agent({ keepAlive: true, maxSockets: 50 }),
  https: new https.Agent({ keepAlive: true, maxSockets: 50 }),
  http2: new http2.Agent({ keepAlive: true, maxSockets: 50 }) // Created HTTP/2 agent
};

const interceptors = {
  request: [],
  response: []
};

const proxyAgents = new Map();

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

// ... (other functions and exports remain unchanged)

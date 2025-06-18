# nklient

A modern, feature-rich HTTP request client for Node.js with support for HTTPS, HTTP/2, cookies, retry logic, interceptors, and more.

[![CI](https://github.com/nitishagar/nklient/actions/workflows/ci.yml/badge.svg)](https://github.com/nitishagar/nklient/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/nitishagar/nklient/branch/master/graph/badge.svg)](https://codecov.io/gh/nitishagar/nklient)
[![npm version](https://badge.fury.io/js/nklient.svg)](https://badge.fury.io/js/nklient)
[![License](https://img.shields.io/github/license/nitishagar/nklient)](https://github.com/nitishagar/nklient/blob/master/LICENSE)

## Features

- **Promise-based API** with async/await support
- **HTTPS support** with certificate validation options
- **Cookie management** with automatic cookie jar
- **Retry logic** with exponential backoff
- **Request/Response interceptors** for middleware functionality
- **Streaming support** for large files
- **Proxy support** for HTTP/HTTPS proxies
- **Compression handling** (gzip, deflate, brotli)
- **Redirect following** with method change support
- **Query string** and **form data** helpers
- **Timeout support** with configurable delays
- **Custom agents** for connection pooling
- **TypeScript definitions** included
- **Zero external dependencies** (only optional peer dependencies)

## Installation

```bash
npm install nklient
```

## Quick Start

```javascript
const nklient = require('nklient');

// Simple GET request
const response = await nklient.get('https://api.example.com/users').exec();
console.log(response.body);

// POST request with JSON
const newUser = await nklient.post('https://api.example.com/users')
  .json({ name: 'John Doe', email: 'john@example.com' })
  .exec();

// Using async/await
try {
  const data = await nklient.get('https://api.example.com/data')
    .headers('Authorization', 'Bearer token')
    .query({ page: 1, limit: 10 })
    .exec();
  console.log(data.body);
} catch (error) {
  console.error('Request failed:', error.message);
}
```

## API Reference

### HTTP Methods

All HTTP methods return a `RequestWrapper` instance that can be configured with chainable methods.

```javascript
nklient.get(url)
nklient.post(url)
nklient.put(url)
nklient.patch(url)
nklient.delete(url)
nklient.head(url)
nklient.options(url)
```

### Request Configuration

#### Headers

```javascript
// Set individual header
nklient.get(url)
  .headers('Authorization', 'Bearer token')
  .headers('X-Custom', 'value')

// Set multiple headers
nklient.get(url)
  .headers({
    'Authorization': 'Bearer token',
    'X-Custom': 'value'
  })
```

#### Request Body

```javascript
// JSON body (auto-sets Content-Type)
nklient.post(url).json({ key: 'value' })

// Form data
nklient.post(url).form({ username: 'john', password: 'secret' })

// Raw body
nklient.post(url).body('raw string data')
nklient.post(url).body(Buffer.from('binary data'))
```

#### Query Parameters

```javascript
nklient.get(url).query({ page: 1, limit: 10 })
// Results in: url?page=1&limit=10
```

#### Timeout

```javascript
nklient.get(url).timeout(5000) // 5 seconds
```

#### Cookies

```javascript
// Use custom cookie jar
const jar = nklient.jar();
nklient.get(url).jar(jar)

// Disable cookies for a request
nklient.get(url).noJar()
```

#### Retry Configuration

```javascript
nklient.get(url).retry({
  attempts: 3,
  delay: 1000,
  maxDelay: 10000,
  backoff: 2,
  retryOn: [408, 429, 500, 502, 503, 504]
})
```

#### Other Options

```javascript
nklient.get(url)
  .maxRedirects(5)           // Maximum number of redirects
  .encoding('utf8')          // Response encoding (null for Buffer)
  .stream()                  // Get response as stream
  .rejectUnauthorized(false) // Disable SSL certificate validation
  .proxy('http://proxy.example.com:8080') // Use proxy
  .agent(customAgent)        // Use custom HTTP agent
```

### Response Object

```javascript
{
  statusCode: 200,
  headers: {
    'content-type': 'application/json',
    // ... other headers
  },
  body: { /* parsed JSON or string/Buffer */ },
  request: {
    uri: 'https://example.com/api',
    method: 'GET',
    headers: { /* request headers */ }
  }
}
```

### Interceptors

Add middleware to requests and responses:

```javascript
// Request interceptor
const requestId = nklient.interceptors.request.use(async (config) => {
  config.headers['X-Request-ID'] = generateId();
  return config;
});

// Response interceptor
const responseId = nklient.interceptors.response.use(async (response) => {
  console.log(`Request took ${response.duration}ms`);
  return response;
});

// Remove interceptor
nklient.interceptors.request.eject(requestId);
nklient.interceptors.response.eject(responseId);
```

### Custom Instances

Create instances with custom defaults:

```javascript
const api = nklient.create({
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  timeout: 10000,
  retry: {
    attempts: 5,
    delay: 1000
  }
});

// Use instance
const response = await api.get('/users').exec();
```

### Global Configuration

```javascript
// Set global defaults
nklient.defaults({
  timeout: 30000,
  headers: {
    'User-Agent': 'MyApp/1.0'
  }
});
```

## Advanced Examples

### File Upload with Streaming

```javascript
const fs = require('fs');

const response = await nklient.post('https://api.example.com/upload')
  .headers('Content-Type', 'application/octet-stream')
  .body(fs.createReadStream('large-file.zip'))
  .exec();
```

### Download File with Progress

```javascript
const fs = require('fs');

const response = await nklient.get('https://example.com/large-file.zip')
  .stream()
  .exec();

const fileStream = fs.createWriteStream('downloaded-file.zip');
let downloaded = 0;

response.body.on('data', (chunk) => {
  downloaded += chunk.length;
  console.log(`Downloaded: ${downloaded} bytes`);
});

response.body.pipe(fileStream);
```

### Error Handling with Retry

```javascript
try {
  const response = await nklient.get('https://flaky-api.example.com/data')
    .retry({
      attempts: 3,
      delay: 1000,
      backoff: 2,
      retryOn: [408, 429, 500, 502, 503, 504]
    })
    .timeout(5000)
    .exec();
    
  console.log('Success:', response.body);
} catch (error) {
  if (error.code === 'ETIMEDOUT') {
    console.error('Request timed out');
  } else if (error.code === 'ECONNREFUSED') {
    console.error('Connection refused');
  } else {
    console.error('Request failed:', error.message);
  }
}
```

### Using with Proxy

```javascript
const response = await nklient.get('https://api.example.com/data')
  .proxy('http://proxy.company.com:8080')
  .exec();
```

### Cookie Management

```javascript
const jar = nklient.jar();

// Login request - cookies are saved
await nklient.post('https://api.example.com/login')
  .jar(jar)
  .json({ username: 'user', password: 'pass' })
  .exec();

// Subsequent requests use saved cookies
const profile = await nklient.get('https://api.example.com/profile')
  .jar(jar)
  .exec();
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format
```

## License

Apache License 2.0
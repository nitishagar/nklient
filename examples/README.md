# nklient Examples

This directory contains examples demonstrating how to use nklient's features.

## Examples

### 1. [basic-usage.js](./basic-usage.js)
Demonstrates basic HTTP requests using `createClient`:
- Simple GET request with base URL
- POST request with JSON data
- Request chaining with headers and timeout

### 2. [config-file.js](./config-file.js)
Shows how to load client configuration from a JSON file:
- Creating a configuration file
- Loading configuration from file path
- Using configured defaults
- Overriding configuration per request

### 3. [advanced-features.js](./advanced-features.js)
Demonstrates advanced features:
- Cookie handling
- Retry configuration
- Request/response interceptors
- Streaming responses

## Running the Examples

Install dependencies first:
```bash
npm install
```

Then run any example:
```bash
node examples/basic-usage.js
node examples/config-file.js
node examples/advanced-features.js
```

## Configuration Schema

See [config/client-config.schema.json](../config/client-config.schema.json) for the full configuration schema.

### Common Configuration Options:

```javascript
{
  "baseUrl": "https://api.example.com",
  "defaultHeaders": {
    "Authorization": "Bearer token",
    "Accept": "application/json"
  },
  "timeout": 30000,
  "maxRedirects": 5,
  "retry": {
    "attempts": 3,
    "delay": 1000,
    "maxDelay": 30000,
    "retryOnStatusCodes": [408, 429, 500, 502, 503, 504],
    "backoffMultiplier": 2
  },
  "cookies": true,
  "followRedirects": true,
  "decompress": true
}
```
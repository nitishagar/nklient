const { createClient } = require('../index');

// Example 1: Using cookies
async function cookieExample() {
  const client = createClient({
    baseUrl: 'https://httpbin.org',
    cookies: true // Enable cookie jar
  });

  try {
    // First request sets a cookie
    await client.get('/cookies/set?session=abc123').exec();

    // Second request will include the cookie
    const response = await client.get('/cookies').exec();
    console.log('Cookies:', response.body.cookies);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 2: Retry configuration
async function retryExample() {
  const client = createClient({
    baseUrl: 'https://httpbin.org',
    retry: {
      attempts: 3,
      delay: 1000,
      maxDelay: 5000,
      retryOnStatusCodes: [500, 502, 503, 504],
      backoffMultiplier: 2
    }
  });

  try {
    // This endpoint randomly returns 500 errors
    const response = await client.get('/status/500').exec();
    console.log('Success after retries:', response.statusCode);
  } catch (error) {
    console.error('Failed after retries:', error.message);
  }
}

// Example 3: Interceptors
async function interceptorExample() {
  const client = createClient({
    baseUrl: 'https://httpbin.org'
  });

  // Add request interceptor
  const requestInterceptorId = client.interceptors.request.use(async config => {
    console.log(`Request: ${config.method} ${config.uri}`);
    config.headers['X-Request-Time'] = new Date().toISOString();
    return config;
  });

  // Add response interceptor
  const responseInterceptorId = client.interceptors.response.use(async response => {
    console.log(`Response: ${response.statusCode} from ${response.request.uri}`);
    return response;
  });

  try {
    await client.get('/get').exec();
    await client.post('/post').body({ test: 'data' }).exec();
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Remove interceptors
  client.interceptors.request.eject(requestInterceptorId);
  client.interceptors.response.eject(responseInterceptorId);
}

// Example 4: Streaming response
async function streamExample() {
  const client = createClient();

  try {
    const response = await client
      .get('https://httpbin.org/stream/5')
      .stream() // Enable streaming
      .exec();

    console.log('Streaming response...');

    response.body.on('data', chunk => {
      console.log('Chunk:', chunk.toString().trim());
    });

    await new Promise(resolve => {
      response.body.on('end', resolve);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run examples
(async () => {
  console.log('=== Cookie Example ===');
  await cookieExample();

  console.log('\n=== Retry Example ===');
  await retryExample();

  console.log('\n=== Interceptor Example ===');
  await interceptorExample();

  console.log('\n=== Stream Example ===');
  await streamExample();
})();

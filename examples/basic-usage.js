const { createClient } = require('../index');

// Example 1: Basic GET request with createClient
async function basicGet() {
  const client = createClient({
    baseUrl: 'https://api.github.com',
    defaultHeaders: {
      'User-Agent': 'nklient-example'
    },
    timeout: 5000
  });

  try {
    const response = await client.get('/users/github').exec();
    console.log('GitHub user:', response.body.name);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 2: POST request with JSON data
async function postWithJson() {
  const client = createClient({
    baseUrl: 'https://httpbin.org',
    defaultHeaders: {
      'Content-Type': 'application/json'
    }
  });

  try {
    const data = { name: 'John Doe', email: 'john@example.com' };
    const response = await client.post('/post').body(data).exec();
    console.log('POST response:', response.body);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 3: Using request chaining
async function chainingExample() {
  const client = createClient();

  try {
    const response = await client
      .get('https://httpbin.org/headers')
      .headers('X-Custom-Header', 'MyValue')
      .headers({ 'X-Another-Header': 'AnotherValue' })
      .timeout(3000)
      .exec();

    console.log('Headers sent:', response.body.headers);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run examples
(async () => {
  console.log('=== Basic GET Example ===');
  await basicGet();

  console.log('\n=== POST with JSON Example ===');
  await postWithJson();

  console.log('\n=== Chaining Example ===');
  await chainingExample();
})();

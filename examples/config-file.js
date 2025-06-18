const { createClient } = require('../index');
const path = require('path');

// Example: Loading configuration from a file

// First, let's create a sample config file
const fs = require('fs');
const configPath = path.join(__dirname, 'client-config.json');

const sampleConfig = {
  baseUrl: 'https://jsonplaceholder.typicode.com',
  defaultHeaders: {
    Accept: 'application/json',
    'User-Agent': 'nklient-config-example'
  },
  timeout: 10000,
  maxRedirects: 3,
  retry: {
    attempts: 2,
    delay: 500,
    retryOnStatusCodes: [500, 502, 503]
  },
  cookies: true
};

// Write the config file
fs.writeFileSync(configPath, JSON.stringify(sampleConfig, null, 2));

async function configFileExample() {
  try {
    // Create client from config file
    const client = createClient(configPath);

    // Make requests using the configured client
    const posts = await client.get('/posts?_limit=3').exec();
    console.log(`Fetched ${posts.body.length} posts`);

    // The baseUrl from config is automatically used
    const user = await client.get('/users/1').exec();
    console.log('User 1:', user.body.name);

    // Override timeout for a specific request
    const comments = await client
      .get('/comments?postId=1')
      .timeout(2000)
      .exec();
    console.log(`Fetched ${comments.body.length} comments`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Clean up the config file
    fs.unlinkSync(configPath);
  }
}

// Run example
(async () => {
  console.log('=== Config File Example ===');
  await configFileExample();
})();

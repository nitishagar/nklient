const nklient = require('../index');
const { createClient } = require('../index');

// Example 1: Basic cookie handling with global jar
async function basicCookieExample() {
  console.log('=== Basic Cookie Handling ===');

  try {
    // First request sets cookies
    const loginResponse = await nklient
      .post('https://httpbin.org/cookies/set')
      .query({ session: 'abc123', user: 'john' })
      .exec();

    console.log('Login response:', loginResponse.statusCode);

    // Second request automatically includes cookies
    const cookieResponse = await nklient
      .get('https://httpbin.org/cookies')
      .exec();

    console.log('Cookies sent:', cookieResponse.body.cookies);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 2: Using the cookies() method
async function cookiesMethodExample() {
  console.log('\n=== Using cookies() Method ===');

  try {
    // Set cookies manually using string format
    const response1 = await nklient
      .get('https://httpbin.org/cookies')
      .cookies('session=xyz789; user=jane')
      .exec();

    console.log('Cookies sent (string format):', response1.body.cookies);

    // Set cookies manually using object format
    const response2 = await nklient
      .get('https://httpbin.org/cookies')
      .cookies({ auth: 'token123', preference: 'dark' })
      .exec();

    console.log('Cookies sent (object format):', response2.body.cookies);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 3: Using custom cookie jar
async function customJarExample() {
  console.log('\n=== Custom Cookie Jar ===');

  try {
    // Create a custom cookie jar
    const jar = nklient.jar();

    // Set cookies in the custom jar
    await nklient
      .get('https://httpbin.org/cookies/set')
      .query({ custom: 'jar123' })
      .jar(jar)
      .exec();

    // Use the same jar for subsequent requests
    const response = await nklient
      .get('https://httpbin.org/cookies')
      .jar(jar)
      .exec();

    console.log('Cookies from custom jar:', response.body.cookies);

    // Disable cookies for a specific request
    const noCookieResponse = await nklient
      .get('https://httpbin.org/cookies')
      .noJar()
      .exec();

    console.log('No cookies sent:', noCookieResponse.body.cookies);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 4: Cookie management functions
async function cookieManagementExample() {
  console.log('\n=== Cookie Management ===');

  try {
    const jar = nklient.jar();
    const url = 'https://httpbin.org';

    // Manually set cookies
    await nklient.setCookie('manual1=value1; Path=/', url, jar);
    await nklient.setCookie('manual2=value2; Path=/; HttpOnly', url, jar);

    // Get all cookies for a URL
    const cookies = await nklient.getCookies(url, jar);
    console.log('All cookies:', cookies.map(c => `${c.key}=${c.value}`));

    // Send request with the cookies
    const response = await nklient
      .get('https://httpbin.org/cookies')
      .jar(jar)
      .exec();

    console.log('Cookies sent:', response.body.cookies);

    // Clear all cookies
    nklient.clearCookies(jar);
    const clearedCookies = await nklient.getCookies(url, jar);
    console.log('Cookies after clearing:', clearedCookies.length);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 5: Using cookies with createClient
async function clientCookieExample() {
  console.log('\n=== Client with Cookies ===');

  const client = createClient({
    baseUrl: 'https://httpbin.org',
    cookies: true // Enable cookies for this client
  });

  try {
    // Set session cookie
    await client.get('/cookies/set').query({ clientSession: 'abc123' }).exec();

    // Add additional cookies for a specific request
    const response = await client
      .get('/cookies')
      .cookies({ additional: 'cookie456' })
      .exec();

    console.log('All cookies sent:', response.body.cookies);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Example 6: Cookie attributes and security
async function cookieSecurityExample() {
  console.log('\n=== Cookie Security ===');

  try {
    const jar = nklient.jar();

    // Set cookies with various attributes
    await nklient.setCookie(
      'secure=value; Secure; HttpOnly; SameSite=Strict; Path=/api',
      'https://example.com/api',
      jar
    );

    // Get cookie details
    const cookies = await nklient.getCookies('https://example.com/api', jar);

    if (cookies.length > 0) {
      const secureCookie = cookies[0];
      console.log('Secure cookie details:');
      console.log('  Key:', secureCookie.key);
      console.log('  Value:', secureCookie.value);
      console.log('  Secure:', secureCookie.secure);
      console.log('  HttpOnly:', secureCookie.httpOnly);
      console.log('  Path:', secureCookie.path);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run all examples
(async () => {
  await basicCookieExample();
  await cookiesMethodExample();
  await customJarExample();
  await cookieManagementExample();
  await clientCookieExample();
  await cookieSecurityExample();
})();

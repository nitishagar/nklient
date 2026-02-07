/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const nock = require('nock');
const nklient = require('../index');
const path = require('path');
const fs = require('fs');

describe('createClient', () => {
  afterEach(() => {
    nock.cleanAll();
    nklient.clearCookies();
  });

  after(() => {
    nklient.cleanup(); // Full cleanup after all tests
  });

  describe('Configuration Loading', () => {
    it('should create client with default configuration', async () => {
      const client = nklient.createClient();

      expect(client.config).to.exist;
      expect(client.config.timeout).to.equal(30000);
      expect(client.config.maxRedirects).to.equal(5);
      expect(client.config.cookies).to.be.false;
      expect(client.jar).to.be.null;
    });

    it('should create client with custom configuration object', async () => {
      const config = {
        baseUrl: 'http://api.example.com',
        defaultHeaders: {
          'X-API-Key': 'secret'
        },
        timeout: 5000,
        cookies: true
      };

      const client = nklient.createClient(config);

      expect(client.config.baseUrl).to.equal('http://api.example.com');
      expect(client.config.defaultHeaders).to.deep.equal({ 'X-API-Key': 'secret' });
      expect(client.config.timeout).to.equal(5000);
      expect(client.config.cookies).to.be.true;
      expect(client.jar).to.exist;
    });

    it('should create client from configuration file', async () => {
      const configPath = path.join(__dirname, 'test-config.json');
      const configContent = {
        baseUrl: 'http://api.example.com',
        defaultHeaders: {
          Authorization: 'Bearer token123'
        },
        timeout: 10000,
        cookies: true,
        retry: {
          attempts: 5,
          delay: 2000
        }
      };

      fs.writeFileSync(configPath, JSON.stringify(configContent));

      try {
        const client = nklient.createClient(configPath);

        expect(client.config.baseUrl).to.equal('http://api.example.com');
        expect(client.config.defaultHeaders.Authorization).to.equal('Bearer token123');
        expect(client.config.timeout).to.equal(10000);
        expect(client.config.retry.attempts).to.equal(5);
        expect(client.jar).to.exist;
      } finally {
        fs.unlinkSync(configPath);
      }
    });

    it('should throw error for invalid configuration file', () => {
      const configPath = path.join(__dirname, 'invalid-config.json');
      fs.writeFileSync(configPath, 'invalid json content');

      try {
        expect(() => nklient.createClient(configPath)).to.throw('Failed to create client: Invalid JSON');
      } finally {
        fs.unlinkSync(configPath);
      }
    });

    it('should throw error for non-existent configuration file', () => {
      expect(() => nklient.createClient('/non/existent/file.json')).to.throw('Failed to create client: Configuration file not found');
    });

    it('should throw error for invalid configuration object', () => {
      const invalidConfig = {
        timeout: 'not a number'
      };

      expect(() => nklient.createClient(invalidConfig)).to.throw('Failed to create client: Invalid configuration');
    });
  });

  describe('HTTP Methods with Client', () => {
    it('should make requests with baseUrl', async () => {
      const client = nklient.createClient({
        baseUrl: 'http://api.example.com'
      });

      const scope = nock('http://api.example.com')
        .get('/users/123')
        .reply(200, { id: 123, name: 'John' });

      const response = await client.get('/users/123').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ id: 123, name: 'John' });
      expect(scope.isDone()).to.be.true;
    });

    it('should apply default headers', async () => {
      const client = nklient.createClient({
        defaultHeaders: {
          'X-API-Key': 'secret',
          'X-Client-Version': '1.0'
        }
      });

      const scope = nock('http://example.com')
        .matchHeader('x-api-key', 'secret')
        .matchHeader('x-client-version', '1.0')
        .get('/test')
        .reply(200);

      const response = await client.get('http://example.com/test').exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should override default headers with request headers', async () => {
      const client = nklient.createClient({
        defaultHeaders: {
          'X-API-Key': 'default-secret'
        }
      });

      const scope = nock('http://example.com')
        .matchHeader('x-api-key', 'override-secret')
        .get('/test')
        .reply(200);

      const response = await client.get('http://example.com/test')
        .headers('X-API-Key', 'override-secret')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should use client-level timeout', async () => {
      const client = nklient.createClient({
        timeout: 100
      });

      nock('http://example.com')
        .get('/slow')
        .delayConnection(200)
        .reply(200);

      try {
        await client.get('http://example.com/slow').exec();
        expect.fail('Should have timed out');
      } catch (error) {
        expect(error.message).to.equal('Request timeout');
      }
    });

    it('should use client-level retry configuration', async () => {
      const client = nklient.createClient({
        retry: {
          attempts: 2,
          delay: 10,
          retryOnStatusCodes: [503]
        }
      });

      let attempts = 0;
      const scope = nock('http://example.com')
        .get('/retry')
        .times(2)
        .reply(() => {
          attempts++;
          if (attempts === 1) {
            return [503, { error: 'Service unavailable' }];
          }
          return [200, { success: true }];
        });

      const response = await client.get('http://example.com/retry').exec();

      expect(response.statusCode).to.equal(200);
      expect(attempts).to.equal(2);
      expect(scope.isDone()).to.be.true;
    });

    it('should use shared cookie jar across requests', async () => {
      const client = nklient.createClient({
        cookies: true
      });

      const scope1 = nock('http://example.com')
        .get('/login')
        .reply(200, { success: true }, {
          'set-cookie': 'session=abc123; Path=/; HttpOnly'
        });

      const scope2 = nock('http://example.com')
        .matchHeader('cookie', 'session=abc123')
        .get('/profile')
        .reply(200, { user: 'john' });

      await client.get('http://example.com/login').exec();
      const response = await client.get('http://example.com/profile').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ user: 'john' });
      expect(scope1.isDone()).to.be.true;
      expect(scope2.isDone()).to.be.true;
    });

    it('should handle followRedirects configuration', async () => {
      const client = nklient.createClient({
        followRedirects: false
      });

      const scope = nock('http://example.com')
        .get('/redirect')
        .reply(302, undefined, { Location: 'http://example.com/final' });

      const response = await client.get('http://example.com/redirect').exec();

      expect(response.statusCode).to.equal(302);
      expect(response.headers.location).to.equal('http://example.com/final');
      expect(scope.isDone()).to.be.true;
    });

    it('should handle maxRedirects configuration', async () => {
      const client = nklient.createClient({
        maxRedirects: 1
      });

      nock('http://example.com')
        .get('/redirect1')
        .reply(302, undefined, { Location: 'http://example.com/redirect2' });

      nock('http://example.com')
        .get('/redirect2')
        .reply(302, undefined, { Location: 'http://example.com/redirect3' });

      try {
        await client.get('http://example.com/redirect1').exec();
        expect.fail('Should have exceeded max redirects');
      } catch (error) {
        expect(error.message).to.equal('Maximum redirects exceeded');
      }
    });

    it('should handle decompress configuration', async () => {
      const client = nklient.createClient({
        decompress: false
      });

      const zlib = require('zlib');
      const data = { message: 'compressed' };
      const compressed = zlib.gzipSync(JSON.stringify(data));

      const scope = nock('http://example.com')
        .get('/compressed')
        .reply(200, compressed, {
          'content-encoding': 'gzip',
          'content-type': 'application/json'
        });

      const response = await client.get('http://example.com/compressed')
        .encoding(null) // Return as buffer when not decompressing
        .exec();

      expect(response.statusCode).to.equal(200);
      // Response should still be compressed since decompress is false
      expect(response.body).to.be.an.instanceof(Buffer);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Custom Request Method', () => {
    it('should support custom request method with client', async () => {
      const client = nklient.createClient({
        baseUrl: 'http://api.example.com'
      });

      const scope = nock('http://api.example.com')
        .get('/custom')
        .reply(200, { custom: true });

      const response = await client.request({
        method: 'GET',
        uri: '/custom'
      }).exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ custom: true });
      expect(scope.isDone()).to.be.true;
    });

    it('should support custom request with url alias', async () => {
      const client = nklient.createClient();

      const scope = nock('http://example.com')
        .get('/test')
        .reply(200);

      const response = await client.request({
        method: 'GET',
        url: 'http://example.com/test'
      }).exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Interceptors with Client', () => {
    it('should support client-specific interceptors', async () => {
      const client = nklient.createClient();

      const scope = nock('http://example.com')
        .matchHeader('x-client', 'custom')
        .get('/test')
        .reply(200);

      const id = client.interceptors.request.use(config => {
        config.headers['X-Client'] = 'custom';
        return config;
      });

      const response = await client.get('http://example.com/test').exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;

      client.interceptors.request.eject(id);
    });
  });

  describe('Keep Alive Configuration', () => {
    it('should handle keepAlive configuration', async () => {
      const client = nklient.createClient({
        keepAlive: false
      });

      const scope = nock('http://example.com')
        .get('/test')
        .reply(200);

      const response = await client.get('http://example.com/test').exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Integration with Request Options', () => {
    it('should merge client config with request options', async () => {
      const client = nklient.createClient({
        baseUrl: 'http://api.example.com',
        timeout: 5000
      });

      const scope = nock('http://api.example.com')
        .get('/test')
        .delayConnection(100)
        .reply(200);

      // Override timeout for this specific request
      const response = await client.get('/test', { timeout: 10000 }).exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Additional createClient Coverage', () => {
    it('should handle loading config from file with error handling', async () => {
      // Test for lines 638-716 - error handling during config loading
      const invalidConfigPath = path.join(__dirname, 'invalid-config.json');
      
      // Create an invalid config file
      fs.writeFileSync(invalidConfigPath, '{ invalid json }');
      
      try {
        nklient.createClient(invalidConfigPath);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to create client');
      } finally {
        // Clean up
        if (fs.existsSync(invalidConfigPath)) {
          fs.unlinkSync(invalidConfigPath);
        }
      }
    });

    it('should handle building options with all config values', async () => {
      // Test for lines 638-716 - building options with all config values
      const config = {
        baseUrl: 'https://api.example.com',
        defaultHeaders: { 'X-API-Key': 'test-key' },
        timeout: 5000,
        maxRedirects: 3,
        retry: { attempts: 2, delay: 1000 },
        cookies: true,
        followRedirects: false,
        decompress: false,
        keepAlive: false
      };

      const client = nklient.createClient(config);
      
      // Test that all config values are properly applied
      expect(client.config.baseUrl).to.equal('https://api.example.com');
      expect(client.config.defaultHeaders['X-API-Key']).to.equal('test-key');
      expect(client.config.timeout).to.equal(5000);
      expect(client.config.maxRedirects).to.equal(3);
      expect(client.config.retry.attempts).to.equal(2);
      expect(client.config.cookies).to.be.true;
      expect(client.config.followRedirects).to.be.false;
      expect(client.config.decompress).to.be.false;
      expect(client.config.keepAlive).to.be.false;
    });

    it('should support custom request method with client', async () => {
      // Test for lines 638-716 - custom request method with client
      const client = nklient.createClient({
        baseUrl: 'https://api.example.com'
      });

      nock('https://api.example.com')
        .patch('/custom')
        .reply(200, { success: true });

      const response = await client.request({
        method: 'PATCH',
        uri: '/custom'
      }).exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body.success).to.be.true;
    });

    it('should support client-specific interceptors', async () => {
      // Test for lines 638-716 - client-specific interceptors
      const client = nklient.createClient({
        baseUrl: 'https://api.example.com'
      });

      let requestInterceptorCalled = false;
      let responseInterceptorCalled = false;

      const requestId = client.interceptors.request.use((config) => {
        requestInterceptorCalled = true;
        config.headers['X-Client-Request'] = 'true';
        return config;
      });

      const responseId = client.interceptors.response.use((response) => {
        responseInterceptorCalled = true;
        return response;
      });

      nock('https://api.example.com')
        .get('/test')
        .matchHeader('x-client-request', 'true')
        .reply(200, { data: 'test' });

      const response = await client.get('/test').exec();

      expect(response.statusCode).to.equal(200);
      expect(requestInterceptorCalled).to.be.true;
      expect(responseInterceptorCalled).to.be.true;

      // Clean up interceptors
      client.interceptors.request.eject(requestId);
      client.interceptors.response.eject(responseId);
    });
  });
});

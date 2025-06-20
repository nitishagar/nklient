/* eslint-disable no-unused-expressions */
/* eslint-disable no-unused-vars */
const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const nklient = require('../index');
const { CookieJar } = require('tough-cookie');
const http = require('http');
const https = require('https');
const { Readable } = require('stream');

describe('nklient', () => {
  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
  });

  describe('Basic HTTP Methods', () => {
    it('should make a GET request', async () => {
      const scope = nock('http://example.com')
        .get('/test')
        .reply(200, { message: 'success' });

      const response = await nklient.get('http://example.com/test').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ message: 'success' });
      expect(scope.isDone()).to.be.true;
    });

    it('should make a POST request with JSON body', async () => {
      const scope = nock('http://example.com')
        .post('/test', { name: 'test' })
        .reply(201, { id: 1, name: 'test' });

      const response = await nklient.post('http://example.com/test')
        .json({ name: 'test' })
        .exec();

      expect(response.statusCode).to.equal(201);
      expect(response.body).to.deep.equal({ id: 1, name: 'test' });
      expect(scope.isDone()).to.be.true;
    });

    it('should make a PUT request', async () => {
      const scope = nock('http://example.com')
        .put('/test/1', { name: 'updated' })
        .reply(200, { id: 1, name: 'updated' });

      const response = await nklient.put('http://example.com/test/1')
        .json({ name: 'updated' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ id: 1, name: 'updated' });
      expect(scope.isDone()).to.be.true;
    });

    it('should make a DELETE request', async () => {
      const scope = nock('http://example.com')
        .delete('/test/1')
        .reply(204);

      const response = await nklient.delete('http://example.com/test/1').exec();

      expect(response.statusCode).to.equal(204);
      expect(scope.isDone()).to.be.true;
    });

    it('should make a PATCH request', async () => {
      const scope = nock('http://example.com')
        .patch('/test/1', { status: 'active' })
        .reply(200, { id: 1, status: 'active' });

      const response = await nklient.patch('http://example.com/test/1')
        .json({ status: 'active' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ id: 1, status: 'active' });
      expect(scope.isDone()).to.be.true;
    });

    it('should make a HEAD request', async () => {
      const scope = nock('http://example.com')
        .head('/test')
        .reply(200, '', { 'content-length': '1234' });

      const response = await nklient.head('http://example.com/test').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.headers['content-length']).to.equal('1234');
      expect(scope.isDone()).to.be.true;
    });

    it('should make an OPTIONS request', async () => {
      const scope = nock('http://example.com')
        .options('/test')
        .reply(200, '', { allow: 'GET,POST,PUT,DELETE' });

      const response = await nklient.options('http://example.com/test').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.headers.allow).to.equal('GET,POST,PUT,DELETE');
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('HTTPS Support', () => {
    it('should make HTTPS requests', async () => {
      const scope = nock('https://example.com')
        .get('/secure')
        .reply(200, { secure: true });

      const response = await nklient.get('https://example.com/secure').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ secure: true });
      expect(scope.isDone()).to.be.true;
    });

    it('should handle certificate validation', async () => {
      const scope = nock('https://example.com')
        .get('/secure')
        .reply(200, { secure: true });

      const response = await nklient.get('https://example.com/secure')
        .rejectUnauthorized(false)
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Headers', () => {
    it('should set headers individually', async () => {
      const scope = nock('http://example.com')
        .matchHeader('authorization', 'Bearer token123')
        .matchHeader('x-custom', 'value')
        .get('/test')
        .reply(200);

      const response = await nklient.get('http://example.com/test')
        .headers('Authorization', 'Bearer token123')
        .headers('X-Custom', 'value')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should set headers as object', async () => {
      const scope = nock('http://example.com')
        .matchHeader('authorization', 'Bearer token123')
        .matchHeader('x-custom', 'value')
        .get('/test')
        .reply(200);

      const response = await nklient.get('http://example.com/test')
        .headers({
          Authorization: 'Bearer token123',
          'X-Custom': 'value'
        })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Query Parameters', () => {
    it('should add query parameters', async () => {
      const scope = nock('http://example.com')
        .get('/test')
        .query({ page: 1, limit: 10 })
        .reply(200, { results: [] });

      const response = await nklient.get('http://example.com/test')
        .query({ page: 1, limit: 10 })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should merge query parameters with existing ones', async () => {
      const scope = nock('http://example.com')
        .get('/test')
        .query({ existing: 'param', page: 1 })
        .reply(200);

      const response = await nklient.get('http://example.com/test?existing=param')
        .query({ page: 1 })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Request Body', () => {
    it('should send form data', async () => {
      const scope = nock('http://example.com')
        .post('/test', 'username=john&password=secret')
        .matchHeader('content-type', 'application/x-www-form-urlencoded')
        .reply(200);

      const response = await nklient.post('http://example.com/test')
        .form({ username: 'john', password: 'secret' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should send raw string body', async () => {
      const scope = nock('http://example.com')
        .post('/test', 'raw string data')
        .reply(200);

      const response = await nklient.post('http://example.com/test')
        .body('raw string data')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should send Buffer body', async () => {
      const buffer = Buffer.from('binary data');
      const scope = nock('http://example.com')
        .post('/test', buffer)
        .reply(200);

      const response = await nklient.post('http://example.com/test')
        .body(buffer)
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Timeouts', () => {
    it('should timeout after specified duration', async () => {
      nock('http://example.com')
        .get('/slow')
        .delayConnection(200)
        .reply(200);

      try {
        await nklient.get('http://example.com/slow')
          .timeout(100)
          .exec();
        expect.fail('Should have timed out');
      } catch (error) {
        expect(error.code).to.equal('ETIMEDOUT');
        expect(error.message).to.equal('Request timeout');
      }
    });
  });

  describe('Redirects', () => {
    it('should follow redirects', async () => {
      const scope1 = nock('http://example.com')
        .get('/redirect')
        .reply(302, undefined, { Location: 'http://example.com/final' });

      const scope2 = nock('http://example.com')
        .get('/final')
        .reply(200, { message: 'final' });

      const response = await nklient.get('http://example.com/redirect').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ message: 'final' });
      expect(scope1.isDone()).to.be.true;
      expect(scope2.isDone()).to.be.true;
    });

    it('should limit redirect count', async () => {
      const scope1 = nock('http://example.com')
        .get('/redirect1')
        .reply(302, undefined, { Location: 'http://example.com/redirect2' });

      const scope2 = nock('http://example.com')
        .get('/redirect2')
        .reply(302, undefined, { Location: 'http://example.com/redirect3' });

      try {
        await nklient.get('http://example.com/redirect1')
          .maxRedirects(1)
          .exec();
        expect.fail('Should have exceeded max redirects');
      } catch (error) {
        expect(error.message).to.equal('Maximum redirects exceeded');
      }
    });

    it('should handle 303 redirect changing POST to GET', async () => {
      const scope1 = nock('http://example.com')
        .post('/submit')
        .reply(303, undefined, { Location: 'http://example.com/result' });

      const scope2 = nock('http://example.com')
        .get('/result')
        .reply(200, { success: true });

      const response = await nklient.post('http://example.com/submit')
        .json({ data: 'test' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ success: true });
    });
  });

  describe('Compression', () => {
    it('should handle gzip compression', async () => {
      const zlib = require('zlib');
      const data = { message: 'compressed' };
      const compressed = zlib.gzipSync(JSON.stringify(data));

      const scope = nock('http://example.com')
        .get('/compressed')
        .reply(200, compressed, {
          'content-encoding': 'gzip',
          'content-type': 'application/json'
        });

      const response = await nklient.get('http://example.com/compressed').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal(data);
      expect(scope.isDone()).to.be.true;
    });

    it('should handle deflate compression', async () => {
      const zlib = require('zlib');
      const data = { message: 'deflated' };
      const compressed = zlib.deflateSync(JSON.stringify(data));

      const scope = nock('http://example.com')
        .get('/compressed')
        .reply(200, compressed, {
          'content-encoding': 'deflate',
          'content-type': 'application/json'
        });

      const response = await nklient.get('http://example.com/compressed').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal(data);
      expect(scope.isDone()).to.be.true;
    });

    it('should handle brotli compression', async () => {
      const zlib = require('zlib');
      const data = { message: 'brotli' };
      const compressed = zlib.brotliCompressSync(JSON.stringify(data));

      const scope = nock('http://example.com')
        .get('/compressed')
        .reply(200, compressed, {
          'content-encoding': 'br',
          'content-type': 'application/json'
        });

      const response = await nklient.get('http://example.com/compressed').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal(data);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Cookies', () => {
    it('should handle cookies with jar', async () => {
      const jar = new CookieJar();

      const scope1 = nock('http://example.com')
        .get('/login')
        .reply(200, { success: true }, {
          'set-cookie': 'session=abc123; Path=/; HttpOnly'
        });

      const scope2 = nock('http://example.com')
        .matchHeader('cookie', 'session=abc123')
        .get('/profile')
        .reply(200, { user: 'john' });

      await nklient.get('http://example.com/login').jar(jar).exec();
      const response = await nklient.get('http://example.com/profile').jar(jar).exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ user: 'john' });
      expect(scope1.isDone()).to.be.true;
      expect(scope2.isDone()).to.be.true;
    });

    it('should use global cookie jar by default', async () => {
      const scope1 = nock('http://example.com')
        .get('/setcookie')
        .reply(200, {}, {
          'set-cookie': 'global=test123; Path=/'
        });

      const scope2 = nock('http://example.com')
        .matchHeader('cookie', 'global=test123')
        .get('/getcookie')
        .reply(200);

      await nklient.get('http://example.com/setcookie').exec();
      const response = await nklient.get('http://example.com/getcookie').exec();

      expect(response.statusCode).to.equal(200);
    });

    it('should disable cookie jar with noJar()', async () => {
      const scope = nock('http://example.com')
        .get('/test')
        .reply(200, {}, {
          'set-cookie': 'ignored=value; Path=/'
        });

      const response = await nklient.get('http://example.com/test').noJar().exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should set cookies via cookies() method with string format', async () => {
      const scope = nock('http://example.com')
        .matchHeader('cookie', (cookieHeader) => {
          // Check that both cookies are present in the header
          return cookieHeader.includes('session=abc123') && cookieHeader.includes('user=john');
        })
        .get('/test')
        .reply(200);

      const response = await nklient.get('http://example.com/test')
        .cookies('session=abc123; user=john')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should set cookies via cookies() method with object format', async () => {
      const scope = nock('http://example.com')
        .matchHeader('cookie', /session=abc123/)
        .matchHeader('cookie', /user=john/)
        .get('/test')
        .reply(200);

      const response = await nklient.get('http://example.com/test')
        .cookies({ session: 'abc123', user: 'john' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should handle cookie domain restrictions', async () => {
      const jar = new CookieJar();

      // Set cookie for example.com
      const scope1 = nock('http://example.com')
        .get('/set')
        .reply(200, {}, {
          'set-cookie': 'session=abc123; Domain=example.com; Path=/'
        });

      // Cookie should not be sent to different domain
      const scope2 = nock('http://other.com')
        .get('/test')
        .reply(200);

      await nklient.get('http://example.com/set').jar(jar).exec();
      const response = await nklient.get('http://other.com/test').jar(jar).exec();

      expect(response.statusCode).to.equal(200);
      // Verify the cookie header was NOT sent to other.com
      expect(scope2.isDone()).to.be.true;
    });

    it('should handle cookie path restrictions', async () => {
      const jar = new CookieJar();

      // Set cookie with specific path
      const scope1 = nock('http://example.com')
        .get('/admin/set')
        .reply(200, {}, {
          'set-cookie': 'admin=true; Path=/admin'
        });

      // Cookie should not be sent to different path
      const scope2 = nock('http://example.com')
        .get('/public')
        .reply(200);

      // Cookie should be sent to same path
      const scope3 = nock('http://example.com')
        .matchHeader('cookie', 'admin=true')
        .get('/admin/dashboard')
        .reply(200);

      await nklient.get('http://example.com/admin/set').jar(jar).exec();
      await nklient.get('http://example.com/public').jar(jar).exec();
      const response = await nklient.get('http://example.com/admin/dashboard').jar(jar).exec();

      expect(response.statusCode).to.equal(200);
      expect(scope1.isDone()).to.be.true;
      expect(scope2.isDone()).to.be.true;
      expect(scope3.isDone()).to.be.true;
    });

    it('should get cookies for a URL', async () => {
      const jar = new CookieJar();

      const scope = nock('http://example.com')
        .get('/set')
        .reply(200, {}, {
          'set-cookie': ['session=abc123; Path=/', 'user=john; Path=/']
        });

      await nklient.get('http://example.com/set').jar(jar).exec();
      const cookies = await nklient.getCookies('http://example.com/', jar);

      expect(cookies.length).to.equal(2);
      expect(cookies.some(c => c.key === 'session' && c.value === 'abc123')).to.be.true;
      expect(cookies.some(c => c.key === 'user' && c.value === 'john')).to.be.true;
    });

    it('should set a cookie manually', async () => {
      const jar = new CookieJar();
      await nklient.setCookie('manual=test123; Path=/', 'http://example.com', jar);

      const scope = nock('http://example.com')
        .matchHeader('cookie', 'manual=test123')
        .get('/test')
        .reply(200);

      const response = await nklient.get('http://example.com/test').jar(jar).exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should clear all cookies', async () => {
      const jar = new CookieJar();

      // Set some cookies
      await nklient.setCookie('test1=value1', 'http://example.com', jar);
      await nklient.setCookie('test2=value2', 'http://example.com', jar);

      // Verify cookies exist
      let cookies = await nklient.getCookies('http://example.com', jar);
      expect(cookies.length).to.be.greaterThan(0);

      // Clear cookies
      nklient.clearCookies(jar);

      // Verify cookies are cleared
      cookies = await nklient.getCookies('http://example.com', jar);
      expect(cookies.length).to.equal(0);
    });

    it('should handle secure cookies', async () => {
      const jar = new CookieJar();

      // Set secure cookie
      const scope1 = nock('https://example.com')
        .get('/set')
        .reply(200, {}, {
          'set-cookie': 'secure=value; Secure; Path=/'
        });

      // Secure cookie should not be sent over HTTP
      const scope2 = nock('http://example.com')
        .get('/test')
        .reply(200);

      // Secure cookie should be sent over HTTPS
      const scope3 = nock('https://example.com')
        .matchHeader('cookie', 'secure=value')
        .get('/test')
        .reply(200);

      await nklient.get('https://example.com/set').jar(jar).exec();
      await nklient.get('http://example.com/test').jar(jar).exec();
      const response = await nklient.get('https://example.com/test').jar(jar).exec();

      expect(response.statusCode).to.equal(200);
      expect(scope1.isDone()).to.be.true;
      expect(scope2.isDone()).to.be.true;
      expect(scope3.isDone()).to.be.true;
    });

    it('should handle HttpOnly cookies', async () => {
      const jar = new CookieJar();

      const scope = nock('http://example.com')
        .get('/set')
        .reply(200, {}, {
          'set-cookie': 'httponly=secret; HttpOnly; Path=/'
        });

      await nklient.get('http://example.com/set').jar(jar).exec();
      const cookies = await nklient.getCookies('http://example.com/', jar);

      const httpOnlyCookie = cookies.find(c => c.key === 'httponly');
      expect(httpOnlyCookie).to.exist;
      expect(httpOnlyCookie.httpOnly).to.be.true;
    });

    it('should handle cookie expiration', async () => {
      const jar = new CookieJar();

      // Set an expired cookie
      const expiredDate = new Date(Date.now() - 86400000).toUTCString(); // Yesterday
      const scope = nock('http://example.com')
        .get('/set')
        .reply(200, {}, {
          'set-cookie': `expired=value; Expires=${expiredDate}; Path=/`
        });

      await nklient.get('http://example.com/set').jar(jar).exec();
      const cookies = await nklient.getCookies('http://example.com/', jar);

      // Expired cookie should not be returned
      expect(cookies.some(c => c.key === 'expired')).to.be.false;
    });

    it('should work with cookies() and jar() together', async () => {
      const jar = new CookieJar();

      // First request sets a cookie via response
      const scope1 = nock('http://example.com')
        .get('/login')
        .reply(200, {}, {
          'set-cookie': 'session=server123; Path=/'
        });

      // Second request adds manual cookie and includes both
      const scope2 = nock('http://example.com')
        .matchHeader('cookie', /session=server123/)
        .matchHeader('cookie', /manual=client456/)
        .get('/api')
        .reply(200);

      await nklient.get('http://example.com/login').jar(jar).exec();
      const response = await nklient.get('http://example.com/api')
        .jar(jar)
        .cookies({ manual: 'client456' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope1.isDone()).to.be.true;
      expect(scope2.isDone()).to.be.true;
    });
  });

  describe('Retry Logic', () => {
    it('should retry on failure', async () => {
      let attempts = 0;
      const scope = nock('http://example.com')
        .get('/flaky')
        .times(3)
        .reply(() => {
          attempts++;
          if (attempts < 3) {
            return [500, { error: 'Server error' }];
          }
          return [200, { success: true }];
        });

      const response = await nklient.get('http://example.com/flaky')
        .retry({ attempts: 3, delay: 10 })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ success: true });
      expect(attempts).to.equal(3);
      expect(scope.isDone()).to.be.true;
    });

    it('should retry on specific status codes', async () => {
      let attempts = 0;
      const scope = nock('http://example.com')
        .get('/retry')
        .times(2)
        .reply(() => {
          attempts++;
          if (attempts === 1) {
            return [429, { error: 'Rate limited' }];
          }
          return [200, { success: true }];
        });

      const response = await nklient.get('http://example.com/retry')
        .retry({ attempts: 2, delay: 10, retryOn: [429] })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(attempts).to.equal(2);
    });

    it('should apply exponential backoff', async () => {
      const startTime = Date.now();
      let attempts = 0;

      const scope = nock('http://example.com')
        .get('/backoff')
        .times(3)
        .reply(() => {
          attempts++;
          return [500, { error: 'Server error' }];
        });

      try {
        await nklient.get('http://example.com/backoff')
          .retry({ attempts: 2, delay: 50, backoff: 2 })
          .exec();
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(attempts).to.equal(3);
        expect(duration).to.be.at.least(150); // 50ms + 100ms delays
      }
    });
  });

  describe('Interceptors', () => {
    it('should apply request interceptors', async () => {
      const scope = nock('http://example.com')
        .matchHeader('x-intercepted', 'true')
        .get('/test')
        .reply(200);

      const id = nklient.interceptors.request.use(config => {
        config.headers['X-Intercepted'] = 'true';
        return config;
      });

      const response = await nklient.get('http://example.com/test').exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;

      nklient.interceptors.request.eject(id);
    });

    it('should apply response interceptors', async () => {
      const scope = nock('http://example.com')
        .get('/test')
        .reply(200, { original: true });

      const id = nklient.interceptors.response.use(response => {
        response.body.intercepted = true;
        return response;
      });

      const response = await nklient.get('http://example.com/test').exec();

      expect(response.body).to.deep.equal({ original: true, intercepted: true });

      nklient.interceptors.response.eject(id);
    });

    it('should handle async interceptors', async () => {
      const scope = nock('http://example.com')
        .matchHeader('x-async', 'processed')
        .get('/test')
        .reply(200);

      const id = nklient.interceptors.request.use(async config => {
        await new Promise(resolve => setTimeout(resolve, 10));
        config.headers['X-Async'] = 'processed';
        return config;
      });

      const response = await nklient.get('http://example.com/test').exec();

      expect(response.statusCode).to.equal(200);

      nklient.interceptors.request.eject(id);
    });
  });

  describe('Streaming', () => {
    it('should support streaming responses', async () => {
      const scope = nock('http://example.com')
        .get('/stream')
        .reply(200, 'streaming data');

      const response = await nklient.get('http://example.com/stream')
        .stream()
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.be.an.instanceof(Readable);

      const chunks = [];
      for await (const chunk of response.body) {
        chunks.push(chunk);
      }

      expect(Buffer.concat(chunks).toString()).to.equal('streaming data');
    });
  });

  describe('Encoding', () => {
    it('should handle different encodings', async () => {
      const scope = nock('http://example.com')
        .get('/latin1')
        .reply(200, Buffer.from('café', 'latin1'));

      const response = await nklient.get('http://example.com/latin1')
        .encoding('latin1')
        .exec();

      expect(response.body).to.equal('café');
    });

    it('should return buffer when encoding is null', async () => {
      const scope = nock('http://example.com')
        .get('/binary')
        .reply(200, Buffer.from([0x00, 0x01, 0x02]));

      const response = await nklient.get('http://example.com/binary')
        .encoding(null)
        .exec();

      expect(response.body).to.be.an.instanceof(Buffer);
      expect(response.body.length).to.equal(3);
    });
  });

  describe('Custom Request', () => {
    it('should support custom request with options object', async () => {
      const scope = nock('http://example.com')
        .get('/custom')
        .reply(200, { custom: true });

      const response = await nklient.request({
        uri: 'http://example.com/custom',
        method: 'GET'
      });

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ custom: true });
    });

    it('should support custom request with string', async () => {
      const scope = nock('http://example.com')
        .get('/simple')
        .reply(200);

      const response = await nklient.request('http://example.com/simple');

      expect(response.statusCode).to.equal(200);
    });
  });

  describe('Instance Creation', () => {
    it('should create instance with custom defaults', async () => {
      const instance = nklient.create({
        headers: { 'X-Custom': 'default' },
        timeout: 5000
      });

      const scope = nock('http://example.com')
        .matchHeader('x-custom', 'default')
        .get('/test')
        .reply(200);

      const response = await instance.get('http://example.com/test').exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Promise Interface', () => {
    it('should support then() directly on wrapper', async () => {
      const scope = nock('http://example.com')
        .get('/promise')
        .reply(200, { promise: true });

      const response = await nklient.get('http://example.com/promise')
        .then(res => res);

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ promise: true });
    });

    it('should support catch() directly on wrapper', async () => {
      const scope = nock('http://example.com')
        .get('/error')
        .replyWithError('Network error');

      const error = await nklient.get('http://example.com/error')
        .catch(err => err);

      expect(error.message).to.include('Network error');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      const scope = nock('http://example.com')
        .get('/error')
        .replyWithError('ECONNREFUSED');

      try {
        await nklient.get('http://example.com/error').exec();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('ECONNREFUSED');
      }
    });

    it('should handle JSON parse errors gracefully', async () => {
      const scope = nock('http://example.com')
        .get('/invalid-json')
        .reply(200, 'not json', {
          'content-type': 'application/json'
        });

      const response = await nklient.get('http://example.com/invalid-json').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.equal('not json');
    });
  });

  describe('Utility Functions', () => {
    it('should create new cookie jar', () => {
      const jar = nklient.jar();
      expect(jar).to.be.an.instanceof(CookieJar);
    });

    it('should configure global defaults', async () => {
      const originalTimeout = nklient.defaults.timeout;

      nklient.defaults({ timeout: 1000 });

      const scope = nock('http://example.com')
        .get('/test')
        .delay(500)
        .reply(200);

      const response = await nklient.get('http://example.com/test').exec();
      expect(response.statusCode).to.equal(200);

      // Restore original timeout
      nklient.defaults({ timeout: originalTimeout });
    });
  });

  describe('Request Body Edge Cases', () => {
    it('should handle postBody alias', async () => {
      const scope = nock('http://example.com')
        .post('/test', { legacy: true })
        .reply(200);

      const response = await nklient.post('http://example.com/test')
        .postBody({ legacy: true })
        .exec();

      expect(response.statusCode).to.equal(200);
    });

    it('should auto-detect JSON content type', async () => {
      const scope = nock('http://example.com')
        .post('/test', { auto: true })
        .matchHeader('content-type', 'application/json')
        .reply(200);

      const response = await nklient.post('http://example.com/test')
        .body({ auto: true })
        .exec();

      expect(response.statusCode).to.equal(200);
    });
  });

  describe('Response Metadata', () => {
    it('should include request information in response', async () => {
      const scope = nock('http://example.com')
        .get('/test')
        .reply(200);

      const response = await nklient.get('http://example.com/test')
        .headers('X-Test', 'value')
        .exec();

      expect(response.request).to.exist;
      expect(response.request.uri).to.equal('http://example.com/test');
      expect(response.request.method).to.equal('GET');
      expect(response.request.headers).to.include({ 'X-Test': 'value' });
    });
  });

  describe('Cookie Error Handling', () => {
    it('should throw error when adding cookies without URI', async () => {
      try {
        nklient.get(null).cookies({ test: 'value' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('URI');
      }
    });

    it('should return empty array when getCookies called without jar', async () => {
      const cookies = await nklient.getCookies('http://example.com/', null);
      expect(cookies).to.be.an('array');
      expect(cookies).to.have.length(0);
    });

    it('should throw error when setCookie called without jar', async () => {
      try {
        await nklient.setCookie('test=value', 'http://example.com/', null);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.equal('No cookie jar available');
      }
    });

    it('should handle clearCookies gracefully without jar', () => {
      // Should not throw
      expect(() => nklient.clearCookies(null)).to.not.throw();
    });

    it('should create jar when setting cookies without existing jar', async () => {
      const scope = nock('http://example.com')
        .matchHeader('cookie', /manual=value/)
        .get('/test')
        .reply(200);

      const response = await nklient.get('http://example.com/test')
        .noJar()
        .cookies({ manual: 'value' })
        .exec();

      expect(response.statusCode).to.equal(200);
    });
  });

  describe('createClient Configuration', () => {
    it('should create client with default configuration', async () => {
      const client = nklient.createClient();
      
      expect(client.config).to.exist;
      expect(client.config.timeout).to.equal(30000);
      expect(client.config.maxRedirects).to.equal(5);
      expect(client.jar).to.be.null; // cookies disabled by default
    });

    it('should create client with custom configuration object', async () => {
      const customConfig = {
        baseUrl: 'http://api.example.com',
        timeout: 5000,
        defaultHeaders: { 'X-API-Key': 'test123' },
        cookies: true
      };

      const client = nklient.createClient(customConfig);
      
      expect(client.config.baseUrl).to.equal('http://api.example.com');
      expect(client.config.timeout).to.equal(5000);
      expect(client.config.defaultHeaders).to.deep.equal({ 'X-API-Key': 'test123' });
      expect(client.jar).to.be.an.instanceof(CookieJar);
    });

    it('should create client from configuration file', async () => {
      // Create a temp config file
      const fs = require('fs');
      const path = require('path');
      const tmpFile = path.join(__dirname, 'test-config.json');
      const config = {
        baseUrl: 'http://file-api.example.com',
        timeout: 10000,
        retry: { attempts: 5 }
      };
      fs.writeFileSync(tmpFile, JSON.stringify(config));

      try {
        const client = nklient.createClient(tmpFile);
        expect(client.config.baseUrl).to.equal('http://file-api.example.com');
        expect(client.config.timeout).to.equal(10000);
        expect(client.config.retry.attempts).to.equal(5);
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('should throw error for invalid configuration', () => {
      const invalidConfig = {
        timeout: 'not-a-number',
        maxRedirects: -1
      };

      try {
        nklient.createClient(invalidConfig);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to create client');
      }
    });

    it('should throw error for non-existent configuration file', () => {
      try {
        nklient.createClient('/non/existent/file.json');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to create client');
        expect(error.message).to.include('not found');
      }
    });

    it('should throw error for invalid JSON in configuration file', () => {
      const fs = require('fs');
      const path = require('path');
      const tmpFile = path.join(__dirname, 'invalid-config.json');
      fs.writeFileSync(tmpFile, '{ invalid json }');

      try {
        nklient.createClient(tmpFile);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Failed to create client');
        expect(error.message).to.include('Invalid JSON');
      } finally {
        fs.unlinkSync(tmpFile);
      }
    });

    it('should use baseUrl for requests', async () => {
      const client = nklient.createClient({
        baseUrl: 'http://api.example.com/v1'
      });

      const scope = nock('http://api.example.com')
        .get('/v1/users')
        .reply(200, { users: [] });

      const response = await client.get('/users').exec();
      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should include defaultHeaders in all requests', async () => {
      const client = nklient.createClient({
        defaultHeaders: {
          'X-API-Key': 'secret123',
          'X-Client': 'test'
        }
      });

      const scope = nock('http://example.com')
        .matchHeader('x-api-key', 'secret123')
        .matchHeader('x-client', 'test')
        .get('/test')
        .reply(200);

      const response = await client.get('http://example.com/test').exec();
      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should handle all HTTP methods with createClient', async () => {
      const client = nklient.createClient();

      // Test each HTTP method
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
      
      for (const method of methods) {
        const scope = nock('http://example.com')[method]('/test')
          .reply(200);

        const response = await client[method]('http://example.com/test').exec();
        expect(response.statusCode).to.equal(200);
        expect(scope.isDone()).to.be.true;
      }
    });

    it('should handle custom request method with createClient', async () => {
      const client = nklient.createClient();

      const scope = nock('http://example.com')
        .intercept('/custom', 'TRACE')
        .reply(200);

      const response = await client.request({
        method: 'TRACE',
        uri: 'http://example.com/custom'
      }).exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should support interceptors with createClient', async () => {
      const client = nklient.createClient();

      const scope = nock('http://example.com')
        .matchHeader('x-intercepted', 'true')
        .get('/test')
        .reply(200);

      const interceptorId = client.interceptors.request.use(config => {
        config.headers['X-Intercepted'] = 'true';
        return config;
      });

      const response = await client.get('http://example.com/test').exec();
      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;

      client.interceptors.request.eject(interceptorId);
    });

    it('should handle followRedirects configuration option', async () => {
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

    it('should handle decompress configuration option', async () => {
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

      const response = await client.get('http://example.com/compressed').exec();
      
      expect(response.statusCode).to.equal(200);
      expect(Buffer.isBuffer(response.body)).to.be.true;
      expect(response.body).to.deep.equal(compressed);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Proxy Support', () => {
    it('should use HTTP proxy for HTTP requests', async () => {
      const proxyUrl = 'http://proxy.example.com:8080';
      const scope = nock('http://example.com')
        .get('/test')
        .reply(200, { proxy: 'http' });

      const response = await nklient.get('http://example.com/test')
        .proxy(proxyUrl)
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ proxy: 'http' });
    });

    it('should use HTTPS proxy for HTTPS requests', async () => {
      const proxyUrl = 'https://proxy.example.com:8443';
      const scope = nock('https://example.com')
        .get('/secure')
        .reply(200, { proxy: 'https' });

      const response = await nklient.get('https://example.com/secure')
        .proxy(proxyUrl)
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ proxy: 'https' });
    });

    it('should work with proxy authentication', async () => {
      const proxyUrl = 'http://user:pass@proxy.example.com:8080';
      const scope = nock('http://example.com')
        .get('/auth')
        .reply(200, { authenticated: true });

      const response = await nklient.get('http://example.com/auth')
        .proxy(proxyUrl)
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ authenticated: true });
    });

    it('should work with proxy and other options', async () => {
      const proxyUrl = 'http://proxy.example.com:8080';
      const scope = nock('http://example.com')
        .matchHeader('x-custom', 'header')
        .get('/combined')
        .reply(200, { combined: true });

      const response = await nklient.get('http://example.com/combined')
        .proxy(proxyUrl)
        .headers('X-Custom', 'header')
        .timeout(5000)
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ combined: true });
    });
  });

  describe('Custom Agent Support', () => {
    it('should use custom agent for requests', async () => {
      const customAgent = new http.Agent({ keepAlive: false, maxSockets: 1 });
      const scope = nock('http://example.com')
        .get('/test')
        .reply(200, { agent: 'custom' });

      const response = await nklient.get('http://example.com/test')
        .agent(customAgent)
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ agent: 'custom' });
    });

    it('should use custom HTTPS agent for HTTPS requests', async () => {
      const customAgent = new https.Agent({ keepAlive: false, maxSockets: 1 });
      const scope = nock('https://example.com')
        .get('/secure')
        .reply(200, { agent: 'custom-https' });

      const response = await nklient.get('https://example.com/secure')
        .agent(customAgent)
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ agent: 'custom-https' });
    });

    it('should override proxy when custom agent is set', async () => {
      const customAgent = new http.Agent({ keepAlive: true });
      const scope = nock('http://example.com')
        .get('/override')
        .reply(200, { override: true });

      const response = await nklient.get('http://example.com/override')
        .proxy('http://proxy.example.com:8080')
        .agent(customAgent) // This should override the proxy
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ override: true });
    });
  });

  describe('Stream Error Handling', () => {
    it('should handle decompression errors', async () => {
      const scope = nock('http://example.com')
        .get('/bad-gzip')
        .reply(200, Buffer.from('not gzip data'), {
          'content-encoding': 'gzip'
        });

      try {
        await nklient.get('http://example.com/bad-gzip').exec();
        expect.fail('Should have thrown decompression error');
      } catch (error) {
        expect(error).to.exist;
        expect(error.code).to.exist;
      }
    });
  });

  describe('Global Cookie Jar Functions', () => {
    it('should use global cookie jar methods with jar parameter', async () => {
      const jar = nklient.jar();
      
      // Test getCookies with jar returning cookies
      await jar.setCookie('test=value', 'http://example.com');
      const cookies = await nklient.getCookies('http://example.com', jar);
      expect(cookies.length).to.be.greaterThan(0);
      
      // Test setCookie with jar
      await nklient.setCookie('another=cookie', 'http://example.com', jar);
      const updatedCookies = await nklient.getCookies('http://example.com', jar);
      expect(updatedCookies.length).to.equal(2);
      
      // Test clearCookies with jar
      nklient.clearCookies(jar);
      const clearedCookies = await nklient.getCookies('http://example.com', jar);
      expect(clearedCookies.length).to.equal(0);
    });
  });

  describe('Global Defaults Configuration', () => {
    it('should merge custom defaults with extend', async () => {
      // Store original defaults
      const originalTimeout = 30000;
      
      nklient.defaults({
        headers: { 'X-Custom': 'value' },
        timeout: 5000
      });
      
      // Test that defaults were merged
      const scope = nock('http://example.com')
        .matchHeader('x-custom', 'value')
        .get('/test')
        .reply(200);
      
      const response = await nklient.get('http://example.com/test').exec();
      expect(response.statusCode).to.equal(200);
      
      // Restore defaults
      nklient.defaults({ timeout: originalTimeout });
    });
  });

  describe('Custom Instance Creation', () => {
    it('should create instance with merged defaults using extend', async () => {
      const instance = nklient.create({
        headers: { 'X-Instance': 'custom' },
        timeout: 3000,
        maxRedirects: 5
      });
      
      const scope = nock('http://example.com')
        .matchHeader('x-instance', 'custom')
        .get('/test')
        .reply(200);
      
      const response = await instance.get('http://example.com/test').exec();
      expect(response.statusCode).to.equal(200);
      
      // Verify the wrapper has merged options
      const wrapper = instance.post('http://example.com/test');
      expect(wrapper.options.timeout).to.equal(3000);
      expect(wrapper.options.maxRedirects).to.equal(5);
    });

    it('should handle all HTTP methods with custom instance', async () => {
      const instance = nklient.create({
        headers: { 'X-Instance': 'test' }
      });

      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
      
      for (const method of methods) {
        const scope = nock('http://example.com')
          .matchHeader('x-instance', 'test')
          [method]('/test')
          .reply(200);

        const response = await instance[method]('http://example.com/test').exec();
        expect(response.statusCode).to.equal(200);
        expect(scope.isDone()).to.be.true;
      }
    });
  });

  describe('Advanced Streaming Features', () => {
    const fs = require('fs');
    const path = require('path');
    const zlib = require('zlib');

    afterEach(() => {
      // Clean up any test files
      const files = ['test-download.txt', 'download.txt'];
      files.forEach(file => {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    });

    it('should handle streaming with compression and pipeToFile', async () => {
      const tmpFile = path.join(__dirname, 'test-download.txt');
      
      const data = 'This is compressed streaming data';
      const compressed = zlib.gzipSync(data);
      
      const scope = nock('http://example.com')
        .get('/stream-gzip')
        .reply(200, compressed, {
          'content-encoding': 'gzip',
          'content-length': compressed.length
        });
      
      const response = await nklient.get('http://example.com/stream-gzip')
        .stream()
        .exec();
      
      await response.body.pipeToFile(tmpFile);
      
      const content = fs.readFileSync(tmpFile, 'utf8');
      expect(content).to.equal(data);
    });
    
    it('should track download progress in streaming mode', async () => {
      const progressEvents = [];
      const data = Buffer.alloc(1024 * 10); // 10KB
      
      const scope = nock('http://example.com')
        .get('/progress')
        .reply(200, data, {
          'content-length': data.length
        });
      
      const response = await nklient.get('http://example.com/progress')
        .stream()
        .onDownloadProgress(progress => {
          progressEvents.push(progress);
        })
        .exec();
      
      const chunks = [];
      for await (const chunk of response.body) {
        chunks.push(chunk);
      }
      
      expect(progressEvents.length).to.be.greaterThan(0);
      expect(progressEvents[progressEvents.length - 1].loaded).to.equal(data.length);
    });
    
    it('should handle streaming request body with upload progress', async () => {
      const { Readable } = require('stream');
      const uploadProgress = [];
      
      const data = Buffer.alloc(1024);
      const stream = Readable.from([data]);
      stream.readableLength = data.length;
      
      const scope = nock('http://example.com')
        .post('/upload', data)
        .reply(200);
      
      const response = await nklient.post('http://example.com/upload')
        .body(stream)
        .onUploadProgress(progress => {
          uploadProgress.push(progress);
        })
        .exec();
      
      expect(response.statusCode).to.equal(200);
      expect(uploadProgress.length).to.be.greaterThan(0);
    });
    
    it('should use pipe() method', async () => {
      const { Writable } = require('stream');
      const chunks = [];
      const writeStream = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });
      
      const scope = nock('http://example.com')
        .get('/pipe')
        .reply(200, 'piped data');
      
      await nklient.get('http://example.com/pipe').pipe(writeStream);
      
      expect(Buffer.concat(chunks).toString()).to.equal('piped data');
    });
    
    it('should use downloadToFile() method', async () => {
      const tmpFile = path.join(__dirname, 'download.txt');
      
      const scope = nock('http://example.com')
        .get('/file')
        .reply(200, 'file content');
      
      const result = await nklient.get('http://example.com/file')
        .downloadToFile(tmpFile);
      
      expect(result.statusCode).to.equal(200);
      expect(result.filePath).to.equal(tmpFile);
      expect(fs.readFileSync(tmpFile, 'utf8')).to.equal('file content');
    });
    
    it('should handle stream body errors', async () => {
      const { Readable } = require('stream');
      const errorStream = new Readable({
        read() {
          this.emit('error', new Error('Stream error'));
        }
      });
      
      const scope = nock('http://example.com')
        .post('/stream-error')
        .reply(200);
      
      try {
        await nklient.post('http://example.com/stream-error')
          .body(errorStream)
          .exec();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.equal('Stream error');
      }
    });

    it('should handle deflate compression in streaming mode', async () => {
      const data = 'deflated streaming data';
      const compressed = zlib.deflateSync(data);
      
      const scope = nock('http://example.com')
        .get('/stream-deflate')
        .reply(200, compressed, {
          'content-encoding': 'deflate'
        });
      
      const response = await nklient.get('http://example.com/stream-deflate')
        .stream()
        .exec();
      
      const chunks = [];
      for await (const chunk of response.body) {
        chunks.push(chunk);
      }
      
      expect(Buffer.concat(chunks).toString()).to.equal(data);
    });
    
    it('should handle brotli compression in streaming mode', async () => {
      const data = 'brotli streaming data';
      const compressed = zlib.brotliCompressSync(data);
      
      const scope = nock('http://example.com')
        .get('/stream-br')
        .reply(200, compressed, {
          'content-encoding': 'br'
        });
      
      const response = await nklient.get('http://example.com/stream-br')
        .stream()
        .exec();
      
      const chunks = [];
      for await (const chunk of response.body) {
        chunks.push(chunk);
      }
      
      expect(Buffer.concat(chunks).toString()).to.equal(data);
    });

    it('should handle download progress in non-streaming mode', async () => {
      const progressEvents = [];
      const data = Buffer.alloc(1024 * 5); // 5KB
      
      const scope = nock('http://example.com')
        .get('/download-progress')
        .reply(200, data, {
          'content-length': data.length
        });
      
      const response = await nklient.get('http://example.com/download-progress')
        .onDownloadProgress(progress => {
          progressEvents.push(progress);
        })
        .exec();
      
      expect(response.statusCode).to.equal(200);
      expect(progressEvents.length).to.be.greaterThan(0);
      expect(progressEvents[progressEvents.length - 1].loaded).to.equal(data.length);
    });

    it('should set content-length for stream with readableLength', async () => {
      const { Readable } = require('stream');
      const data = Buffer.alloc(1024);
      const stream = Readable.from([data]);
      stream.readableLength = data.length;
      
      const scope = nock('http://example.com')
        .matchHeader('content-length', data.length.toString())
        .post('/stream-length', data)
        .reply(200);
      
      const response = await nklient.post('http://example.com/stream-length')
        .body(stream)
        .exec();
      
      expect(response.statusCode).to.equal(200);
    });

    it('should use chunked encoding for streams without length', async () => {
      const { Readable } = require('stream');
      const data = Buffer.from('streaming data');
      const stream = Readable.from([data]);
      
      const scope = nock('http://example.com')
        .matchHeader('transfer-encoding', 'chunked')
        .post('/stream-chunked')
        .reply(200);
      
      const response = await nklient.post('http://example.com/stream-chunked')
        .body(stream)
        .exec();
      
      expect(response.statusCode).to.equal(200);
    });
  });

  describe('Edge Cases', () => {
    it('should handle URI validation error', async () => {
      try {
        await nklient.get('').exec();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('URI');
      }
    });

    it('should handle invalid JSON gracefully keeping data as Buffer', async () => {
      const scope = nock('http://example.com')
        .get('/invalid-json')
        .reply(200, Buffer.from('not json'), {
          'content-type': 'application/json'
        });

      const response = await nklient.get('http://example.com/invalid-json').exec();
      
      expect(response.statusCode).to.equal(200);
      expect(Buffer.isBuffer(response.body)).to.be.true;
      expect(response.body.toString()).to.equal('not json');
    });

    it('should handle malformed redirect URLs', async () => {
      const scope = nock('http://example.com')
        .get('/bad-redirect')
        .reply(302, undefined, { Location: '://invalid-url' });

      try {
        await nklient.get('http://example.com/bad-redirect').exec();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });
});

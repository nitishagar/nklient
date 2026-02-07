/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const nock = require('nock');
const nklient = require('../index');
const http = require('http');

describe('Coverage Gap Tests', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('HTTP Methods', () => {
    it('should make a PUT request', async () => {
      const scope = nock('http://example.com')
        .put('/resource', { data: 'updated' })
        .reply(200, { updated: true });

      const response = await nklient.put('http://example.com/resource')
        .json({ data: 'updated' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ updated: true });
      expect(scope.isDone()).to.be.true;
    });

    it('should make a DELETE request', async () => {
      const scope = nock('http://example.com')
        .delete('/resource/1')
        .reply(204);

      const response = await nklient.delete('http://example.com/resource/1').exec();

      expect(response.statusCode).to.equal(204);
      expect(scope.isDone()).to.be.true;
    });

    it('should make a HEAD request', async () => {
      const scope = nock('http://example.com')
        .head('/resource')
        .reply(200, undefined, { 'x-total-count': '42' });

      const response = await nklient.head('http://example.com/resource').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.headers['x-total-count']).to.equal('42');
      expect(scope.isDone()).to.be.true;
    });

    it('should make an OPTIONS request', async () => {
      const scope = nock('http://example.com')
        .options('/resource')
        .reply(200, undefined, { allow: 'GET, POST, PUT, DELETE' });

      const response = await nklient.options('http://example.com/resource').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.headers.allow).to.equal('GET, POST, PUT, DELETE');
      expect(scope.isDone()).to.be.true;
    });

    it('should make a PATCH request', async () => {
      const scope = nock('http://example.com')
        .patch('/resource/1', { field: 'value' })
        .reply(200, { patched: true });

      const response = await nklient.patch('http://example.com/resource/1')
        .json({ field: 'value' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Query Builder', () => {
    it('should add query parameters to URL', async () => {
      const scope = nock('http://example.com')
        .get('/search')
        .query({ q: 'test', page: '1' })
        .reply(200, { results: [] });

      const response = await nklient.get('http://example.com/search')
        .query({ q: 'test', page: '1' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should append to existing query parameters', async () => {
      const scope = nock('http://example.com')
        .get('/search')
        .query({ existing: 'param', q: 'test' })
        .reply(200);

      const response = await nklient.get('http://example.com/search?existing=param')
        .query({ q: 'test' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should handle numeric query parameters', async () => {
      const scope = nock('http://example.com')
        .get('/filter')
        .query({ limit: '10', offset: '20' })
        .reply(200);

      const response = await nklient.get('http://example.com/filter')
        .query({ limit: 10, offset: 20 })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('RequestWrapper Methods', () => {
    it('should use custom agent', async () => {
      const customAgent = new http.Agent({ keepAlive: false });

      const scope = nock('http://example.com')
        .get('/test')
        .reply(200);

      const response = await nklient.get('http://example.com/test')
        .agent(customAgent)
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
      customAgent.destroy();
    });

    it('should disable cookie jar with noJar()', async () => {
      const scope = nock('http://example.com')
        .get('/no-cookies')
        .reply(200, { noCookies: true });

      const response = await nklient.get('http://example.com/no-cookies')
        .noJar()
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should use create() as alias for createClient()', () => {
      const client = nklient.create();
      expect(client.config).to.exist;
      expect(client.get).to.be.a('function');
    });

    it('should use request() method', async () => {
      const scope = nock('http://example.com')
        .get('/test')
        .reply(200, { ok: true });

      const response = await nklient.request('http://example.com/test').exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should use request() with options object', async () => {
      const scope = nock('http://example.com')
        .post('/test')
        .reply(200);

      const response = await nklient.request({
        method: 'POST',
        url: 'http://example.com/test'
      }).exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should use rejectUnauthorized()', async () => {
      const scope = nock('http://example.com')
        .get('/test')
        .reply(200);

      const response = await nklient.get('http://example.com/test')
        .rejectUnauthorized(false)
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should track download progress', async () => {
      const data = 'x'.repeat(1000);
      const scope = nock('http://example.com')
        .get('/download')
        .reply(200, data, { 'content-length': '1000' });

      let progressCalled = false;
      const response = await nklient.get('http://example.com/download')
        .onDownloadProgress((progress) => {
          progressCalled = true;
          expect(progress.loaded).to.be.a('number');
          expect(progress.total).to.equal(1000);
        })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(progressCalled).to.be.true;
      expect(scope.isDone()).to.be.true;
    });

    it('should send form-urlencoded data', async () => {
      const scope = nock('http://example.com')
        .post('/form', 'name=John&age=30')
        .matchHeader('content-type', 'application/x-www-form-urlencoded')
        .reply(200);

      const response = await nklient.post('http://example.com/form')
        .form({ name: 'John', age: '30' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should send raw body data', async () => {
      const scope = nock('http://example.com')
        .post('/raw', 'raw body content')
        .reply(200);

      const response = await nklient.post('http://example.com/raw')
        .body('raw body content')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Decompression', () => {
    it('should handle deflate decompression', async () => {
      const zlib = require('zlib');
      const originalData = 'deflated data';
      const compressed = zlib.deflateSync(originalData);

      nock('http://example.com')
        .get('/deflate')
        .reply(200, compressed, {
          'content-encoding': 'deflate',
          'content-type': 'text/plain'
        });

      const response = await nklient.get('http://example.com/deflate').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.equal(originalData);
    });

    it('should handle brotli decompression', async () => {
      const zlib = require('zlib');
      const originalData = 'brotli compressed data';
      const compressed = zlib.brotliCompressSync(originalData);

      nock('http://example.com')
        .get('/brotli')
        .reply(200, compressed, {
          'content-encoding': 'br',
          'content-type': 'text/plain'
        });

      const response = await nklient.get('http://example.com/brotli').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.equal(originalData);
    });
  });

  describe('Error Classes', () => {
    it('should create MaxRedirectsError', () => {
      const { MaxRedirectsError } = require('../dist/errors');
      const err = new MaxRedirectsError(10);
      expect(err.name).to.equal('MaxRedirectsError');
      expect(err.code).to.equal('ERR_MAX_REDIRECTS');
      expect(err.redirectCount).to.equal(10);
      expect(err.message).to.include('10');
    });

    it('should create ResponseTooLargeError', () => {
      const { ResponseTooLargeError } = require('../dist/errors');
      const err = new ResponseTooLargeError(1024);
      expect(err.name).to.equal('ResponseTooLargeError');
      expect(err.code).to.equal('ERR_RESPONSE_TOO_LARGE');
      expect(err.maxSize).to.equal(1024);
    });

    it('should create AbortError', () => {
      const { AbortError } = require('../dist/errors');
      const err = new AbortError();
      expect(err.name).to.equal('AbortError');
      expect(err.code).to.equal('ERR_ABORTED');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle interceptor errors gracefully', async () => {
      const id = nklient.interceptors.request.use(() => {
        throw new Error('Interceptor failed');
      });

      try {
        await nklient.get('http://example.com/test').exec();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).to.equal('Interceptor failed');
      }

      nklient.interceptors.request.eject(id);
    });

    it('should handle response interceptor errors', async () => {
      nock('http://example.com')
        .get('/test')
        .reply(200, { data: 'ok' });

      const id = nklient.interceptors.response.use(() => {
        throw new Error('Response interceptor failed');
      });

      try {
        await nklient.get('http://example.com/test').exec();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).to.equal('Response interceptor failed');
      }

      nklient.interceptors.response.eject(id);
    });

    it('should validate cookie CRLF injection', () => {
      expect(() => {
        nklient.get('http://example.com/test')
          .cookies({ 'evil\r\n': 'value' });
      }).to.throw('invalid characters');
    });

    it('should use nklient.jar() to create cookie jars', () => {
      const jar = nklient.jar();
      expect(jar).to.exist;
      expect(jar.setCookie).to.be.a('function');
    });
  });

  describe('Client Methods', () => {
    it('should use client PUT method', async () => {
      const client = nklient.createClient({ baseUrl: 'http://api.example.com' });
      const scope = nock('http://api.example.com')
        .put('/resource')
        .reply(200);

      const response = await client.put('/resource').exec();
      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should use client DELETE method', async () => {
      const client = nklient.createClient({ baseUrl: 'http://api.example.com' });
      const scope = nock('http://api.example.com')
        .delete('/resource')
        .reply(200);

      const response = await client.delete('/resource').exec();
      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should use client HEAD method', async () => {
      const client = nklient.createClient({ baseUrl: 'http://api.example.com' });
      const scope = nock('http://api.example.com')
        .head('/resource')
        .reply(200);

      const response = await client.head('/resource').exec();
      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should use client OPTIONS method', async () => {
      const client = nklient.createClient({ baseUrl: 'http://api.example.com' });
      const scope = nock('http://api.example.com')
        .options('/resource')
        .reply(200);

      const response = await client.options('/resource').exec();
      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should use client PATCH method', async () => {
      const client = nklient.createClient({ baseUrl: 'http://api.example.com' });
      const scope = nock('http://api.example.com')
        .patch('/resource')
        .reply(200);

      const response = await client.patch('/resource').exec();
      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should use compactInterceptors', () => {
      nklient.compactInterceptors();
      // Should not throw
    });

    it('should report interceptor array length', () => {
      const len = nklient.getInterceptorArrayLength('request');
      expect(len).to.be.a('number');
    });

    it('should use client compactInterceptors and getInterceptorArrayLength', () => {
      const client = nklient.createClient();
      client.compactInterceptors();
      const len = client.getInterceptorArrayLength('request');
      expect(len).to.be.a('number');
    });

    it('should use cleanup method', () => {
      // Just verify it doesn't throw
      nklient.cleanup();
    });

    it('should use closeAgents method', () => {
      nklient.closeAgents();
    });
  });

  describe('Thenable Interface', () => {
    it('should support await directly (thenable)', async () => {
      nock('http://example.com')
        .get('/thenable')
        .reply(200, { result: 'ok' });

      // Await the RequestWrapper directly (uses then())
      const response = await nklient.get('http://example.com/thenable');

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ result: 'ok' });
    });

    it('should support catch on thenable', async () => {
      try {
        await nklient.get('http://nonexistent.invalid/test')
          .timeout(100)
          .catch(err => { throw err; });
      } catch (error) {
        expect(error).to.be.an('error');
      }
    });
  });
});

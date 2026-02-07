/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const nock = require('nock');
const nklient = require('../index');
const { Readable } = require('stream');

describe('Error Handling', () => {
  afterEach(() => {
    nock.cleanAll();
    nklient.clearCookies();
  });

  after(() => {
    nklient.cleanup(); // Full cleanup after all tests
  });

  describe('Cookie Error Handling', () => {
    it('should throw error when adding cookies without URI', () => {
      const request = nklient.get();

      expect(() => request.cookies('test=value')).to.throw('URI must be set before adding cookies');
    });

    it('should throw error when cookie setting fails', () => {
      const request = nklient.get('http://example.com/test');

      // Pass an invalid cookie format that will cause an error
      expect(() => request.cookies({ '\n': 'invalid' })).to.throw('Failed to set cookies');
    });

    it('should throw error when setCookie is called without jar', async () => {
      try {
        await nklient.setCookie('test=value', 'http://example.com', null);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.equal('No cookie jar available');
      }
    });

    it('should return empty array when getCookies is called without jar', async () => {
      const cookies = await nklient.getCookies('http://example.com', null);
      expect(cookies).to.be.an('array').that.is.empty;
    });

    it('should handle clearCookies gracefully when jar is null', () => {
      // Should not throw
      expect(() => nklient.clearCookies(null)).to.not.throw();
    });
  });

  describe('Request Error Handling', () => {
    it('should throw error when URI is not provided', async () => {
      try {
        await nklient.request({});
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.equal('URI is required');
      }
    });

    it('should throw error when null params are provided', async () => {
      try {
        await nklient.request(null);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.equal('URI is required');
      }
    });

    it('should throw error when makeRequest is called without URI', async () => {
      try {
        await nklient.request({ method: 'GET' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.equal('URI is required');
      }
    });
  });

  describe('Response Stream Error Handling', () => {
    it('should handle response stream errors gracefully', async () => {
      nock('http://example.com')
        .get('/stream-error')
        .reply(200, function () {
          let pushed = false;
          const stream = new Readable({
            read() {
              if (!pushed) {
                pushed = true;
                this.push('some data');
                process.nextTick(() => this.destroy(new Error('Stream error')));
              }
            }
          });
          return stream;
        });

      try {
        await nklient.get('http://example.com/stream-error').exec();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.equal('Stream error');
      }
    });

    it('should handle gzip decompression errors', async () => {
      nock('http://example.com')
        .get('/bad-gzip')
        .reply(200, Buffer.from('not gzip data'), {
          'content-encoding': 'gzip'
        });

      try {
        await nklient.get('http://example.com/bad-gzip').exec();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('incorrect header check');
      }
    });
  });

  describe('Response Body Handling', () => {
    it('should handle null encoding by returning buffer', async () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      nock('http://example.com')
        .get('/binary')
        .reply(200, binaryData);

      const response = await nklient.get('http://example.com/binary')
        .encoding(null)
        .exec();

      expect(response.body).to.be.an.instanceof(Buffer);
      expect(response.body.length).to.equal(4);
      expect(Array.from(response.body)).to.deep.equal([0x00, 0x01, 0x02, 0x03]);
    });

    it('should handle JSON parse errors and return as string', async () => {
      nock('http://example.com')
        .get('/invalid-json')
        .reply(200, 'this is not valid json', {
          'content-type': 'application/json'
        });

      const response = await nklient.get('http://example.com/invalid-json').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.equal('this is not valid json');
    });
  });

  describe('Request with Pre-built Options', () => {
    it('should handle RequestWrapper with pre-built options', async () => {
      nock('http://example.com')
        .matchHeader('x-custom', 'value')
        .get('/test')
        .reply(200, { success: true });

      // This test verifies the pre-built options path is working
      const client = nklient.createClient({
        defaultHeaders: { 'X-Custom': 'value' },
        timeout: 5000,
        cookies: true
      });

      const response = await client.get('http://example.com/test').exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ success: true });
    });
  });

  describe('Timeout Handling', () => {
    it('should properly handle timeout errors', async () => {
      // Use nock with delay to reliably trigger timeout
      nock('http://example.com')
        .get('/slow')
        .delayConnection(500)
        .reply(200, { data: 'slow' });

      try {
        await nklient.get('http://example.com/slow').timeout(50).exec();
        expect.fail('Should have timed out');
      } catch (error) {
        expect(error.code).to.equal('ETIMEDOUT');
        expect(error.message).to.equal('Request timeout');
      }
    });
  });

  describe('Redirect Error Handling', () => {
    it('should handle maximum redirects exceeded', async () => {
      // Create a redirect loop
      nock('http://example.com')
        .persist()
        .get('/redirect1')
        .reply(302, undefined, { Location: 'http://example.com/redirect2' });

      nock('http://example.com')
        .persist()
        .get('/redirect2')
        .reply(302, undefined, { Location: 'http://example.com/redirect1' });

      try {
        await nklient.get('http://example.com/redirect1')
          .maxRedirects(5)
          .exec();
        expect.fail('Should have exceeded max redirects');
      } catch (error) {
        expect(error.message).to.equal('Maximum redirects exceeded');
      }
    });
  });

  describe('Network Error Handling', () => {
    it('should handle connection refused errors', async () => {
      // Use a port that's likely not in use
      try {
        await nklient.get('http://localhost:65535/test').timeout(1000).exec();
        expect.fail('Should have thrown connection error');
      } catch (error) {
        // The error could be ECONNREFUSED or timeout depending on the system
        expect(error.code).to.be.oneOf(['ECONNREFUSED', 'ETIMEDOUT']);
      }
    });
  });

  describe('Promise Error Handling', () => {
    it('should properly handle errors in catch method', async () => {
      // Create a request that will fail
      const error = await nklient.get('http://localhost:65535/test')
        .timeout(100)
        .catch(err => err);

      expect(error).to.be.an('error');
      expect(error.code).to.be.oneOf(['ECONNREFUSED', 'ETIMEDOUT']);
    });
  });
});

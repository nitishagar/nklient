/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const nklient = require('../index');
const nock = require('nock');

describe('Cleanup Verification Tests', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('Resource Cleanup', () => {
    it('should not leak memory after multiple requests', async () => {
      nock('http://example.com')
        .get('/test')
        .times(10)
        .reply(200, { data: 'test' });

      // Make multiple requests
      for (let i = 0; i < 10; i++) {
        const response = await nklient.get('http://example.com/test').exec();
        expect(response.statusCode).to.equal(200);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Check that we don't have excessive active handles
      const handles = process._getActiveHandles();
      const requests = handles.filter(h => h.constructor.name === 'ClientRequest');
      
      // Should have no active requests after completion
      expect(requests).to.have.length(0);
    });

    it('should properly dispose of resources on error', async () => {
      nock('http://example.com')
        .get('/error')
        .replyWithError('Network error');

      try {
        await nklient.get('http://example.com/error').exec();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Network error');
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Check that we don't have orphaned handles
      const handles = process._getActiveHandles();
      const requests = handles.filter(h => h.constructor.name === 'ClientRequest');
      
      expect(requests).to.have.length(0);
    });

    it('should not accumulate event listeners', async () => {
      nock('http://example.com')
        .get('/test')
        .times(5)
        .reply(200, { data: 'test' });

      // Make multiple requests
      for (let i = 0; i < 5; i++) {
        const response = await nklient.get('http://example.com/test').exec();
        expect(response.statusCode).to.equal(200);
      }

      // Check that we don't have excessive listeners
      const handles = process._getActiveHandles();
      const eventEmitters = handles.filter(h => h.constructor.name === 'EventEmitter');
      
      // Should not have excessive event emitters
      expect(eventEmitters.length).to.be.lessThan(10);
    });
  });

  describe('Stream Cleanup', () => {
    it('should cleanup streams on completion', async () => {
      nock('http://example.com')
        .get('/stream')
        .reply(200, 'stream data');

      const response = await nklient.get('http://example.com/stream')
        .stream()
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.exist;

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Check that streams are properly cleaned up
      const handles = process._getActiveHandles();
      const streams = handles.filter(h => h.constructor.name.includes('Stream'));
      
      // Should not have excessive streams
      expect(streams.length).to.be.lessThan(5);
    });

    it('should cleanup streams on error', async () => {
      nock('http://example.com')
        .get('/stream-error')
        .reply(200, () => {
          const { Readable } = require('stream');
          let pushed = false;
          return new Readable({
            read() {
              if (!pushed) {
                pushed = true;
                this.destroy(new Error('Stream error'));
              }
            }
          });
        });

      // In stream mode, exec() resolves with the stream; errors appear on the stream
      const response = await nklient.get('http://example.com/stream-error')
        .stream()
        .exec();

      // Consume the stream and expect the error
      try {
        for await (const _chunk of response.body) {
          // drain
        }
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('Stream error');
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Check that error streams are cleaned up
      const handles = process._getActiveHandles();
      const streams = handles.filter(h => h.constructor.name.includes('Stream'));

      expect(streams.length).to.be.lessThan(5);
    });
  });

  describe('Cookie Cleanup', () => {
    it('should cleanup cookie jars properly', async () => {
      nock('http://example.com')
        .get('/cookies')
        .reply(200, { data: 'test' }, {
          'Set-Cookie': 'test=value; Path=/'
        });

      const jar = nklient.jar();
      const response = await nklient.get('http://example.com/cookies')
        .jar(jar)
        .exec();

      expect(response.statusCode).to.equal(200);

      // Clear cookies
      nklient.clearCookies(jar);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Check that cookie jar is cleaned up
      const cookies = await nklient.getCookies('http://example.com', jar);
      expect(cookies).to.have.length(0);
    });
  });

  describe('Interceptor Cleanup', () => {
    it('should cleanup interceptors properly', async () => {
      nock('http://example.com')
        .get('/test')
        .times(2)
        .reply(200, { data: 'test' });

      let interceptorCallCount = 0;
      const id = nklient.interceptors.request.use((config) => {
        interceptorCallCount++;
        return config;
      });

      const response = await nklient.get('http://example.com/test').exec();
      expect(response.statusCode).to.equal(200);
      expect(interceptorCallCount).to.equal(1);

      // Remove interceptor
      nklient.interceptors.request.eject(id);

      // Make another request
      const response2 = await nklient.get('http://example.com/test').exec();
      expect(response2.statusCode).to.equal(200);

      // Interceptor should not be called again after eject
      expect(interceptorCallCount).to.equal(1);
    });
  });
});

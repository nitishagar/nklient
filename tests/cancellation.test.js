/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const nock = require('nock');
const nklient = require('../index');

describe('Request Cancellation', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('AbortController Support', () => {
    it('should cancel a request with AbortController', async () => {
      nock('http://example.com')
        .get('/slow')
        .delayConnection(500)
        .reply(200, { data: 'ok' });

      const controller = new AbortController();

      setTimeout(() => controller.abort(), 50);

      try {
        await nklient.get('http://example.com/slow')
          .signal(controller.signal)
          .exec();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.name).to.equal('AbortError');
        expect(error.code).to.equal('ERR_ABORTED');
      }
    });

    it('should reject immediately if signal is already aborted', async () => {
      nock('http://example.com')
        .get('/test')
        .reply(200, { data: 'ok' });

      const controller = new AbortController();
      controller.abort();

      try {
        await nklient.get('http://example.com/test')
          .signal(controller.signal)
          .exec();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.name).to.equal('AbortError');
        expect(error.code).to.equal('ERR_ABORTED');
      }
    });

    it('should work with createClient', async () => {
      const client = nklient.createClient({
        baseUrl: 'http://api.example.com'
      });

      nock('http://api.example.com')
        .get('/data')
        .delayConnection(500)
        .reply(200, { data: 'ok' });

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 50);

      try {
        await client.get('/data')
          .signal(controller.signal)
          .exec();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.name).to.equal('AbortError');
      }
    });

    it('should not affect request when signal is not aborted', async () => {
      nock('http://example.com')
        .get('/test')
        .reply(200, { data: 'ok' });

      const controller = new AbortController();

      const response = await nklient.get('http://example.com/test')
        .signal(controller.signal)
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ data: 'ok' });
    });

    it('should cancel during retry', async () => {
      let attempts = 0;
      nock('http://example.com')
        .get('/retry-cancel')
        .times(5)
        .reply(() => {
          attempts++;
          return [503, { error: 'fail' }];
        });

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);

      try {
        await nklient.get('http://example.com/retry-cancel')
          .signal(controller.signal)
          .retry({ attempts: 5, delay: 50, backoffMultiplier: 1, retryOnStatusCodes: [503] })
          .exec();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.name).to.equal('AbortError');
        expect(attempts).to.be.at.least(1);
      }
    });
  });
});

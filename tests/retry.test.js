/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const nock = require('nock');
const nklient = require('../index');

describe('Retry Logic', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('Basic Retry Behavior', () => {
    it('should retry on 503 status code', async () => {
      let attempts = 0;
      nock('http://example.com')
        .get('/retry')
        .times(3)
        .reply(() => {
          attempts++;
          if (attempts < 3) {
            return [503, { error: 'Service unavailable' }];
          }
          return [200, { success: true }];
        });

      const response = await nklient.get('http://example.com/retry')
        .retry({ attempts: 3, delay: 10, backoffMultiplier: 1, retryOnStatusCodes: [503] })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ success: true });
      expect(attempts).to.equal(3);
    });

    it('should retry on 429 status code', async () => {
      let attempts = 0;
      nock('http://example.com')
        .get('/rate-limit')
        .times(2)
        .reply(() => {
          attempts++;
          if (attempts === 1) {
            return [429, { error: 'Too many requests' }];
          }
          return [200, { data: 'ok' }];
        });

      const response = await nklient.get('http://example.com/rate-limit')
        .retry({ attempts: 2, delay: 10, backoffMultiplier: 1, retryOnStatusCodes: [429] })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(attempts).to.equal(2);
    });

    it('should not retry on non-retryable status codes', async () => {
      let attempts = 0;
      nock('http://example.com')
        .get('/not-found')
        .reply(() => {
          attempts++;
          return [404, { error: 'Not found' }];
        });

      const response = await nklient.get('http://example.com/not-found')
        .retry({ attempts: 3, delay: 10, backoffMultiplier: 1, retryOnStatusCodes: [503] })
        .exec();

      // 404 is not retryable, should return immediately
      expect(response.statusCode).to.equal(404);
      expect(attempts).to.equal(1);
    });

    it('should throw RetryExhaustedError when all attempts fail', async () => {
      nock('http://example.com')
        .get('/always-fail')
        .times(3)
        .reply(503, { error: 'Service unavailable' });

      try {
        await nklient.get('http://example.com/always-fail')
          .retry({ attempts: 3, delay: 10, backoffMultiplier: 1, retryOnStatusCodes: [503] })
          .exec();
        expect.fail('Should have thrown RetryExhaustedError');
      } catch (error) {
        expect(error.code).to.equal('ERR_RETRY_EXHAUSTED');
        expect(error.name).to.equal('RetryExhaustedError');
        expect(error.attempts).to.equal(3);
        expect(error.message).to.include('Request failed after 3 attempt(s)');
      }
    });
  });

  describe('Exponential Backoff', () => {
    it('should apply exponential backoff between retries', async () => {
      const timestamps = [];
      nock('http://example.com')
        .get('/backoff')
        .times(3)
        .reply(() => {
          timestamps.push(Date.now());
          if (timestamps.length < 3) {
            return [503, { error: 'fail' }];
          }
          return [200, { success: true }];
        });

      await nklient.get('http://example.com/backoff')
        .retry({ attempts: 3, delay: 50, backoffMultiplier: 2, retryOnStatusCodes: [503] })
        .exec();

      expect(timestamps).to.have.length(3);
      // First retry delay should be ~50ms, second ~100ms
      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];
      expect(delay1).to.be.at.least(30); // Allow some tolerance
      expect(delay2).to.be.at.least(60); // Should be ~2x the first delay
    });

    it('should cap delay at maxDelay', async () => {
      const timestamps = [];
      nock('http://example.com')
        .get('/max-delay')
        .times(4)
        .reply(() => {
          timestamps.push(Date.now());
          if (timestamps.length < 4) {
            return [503, { error: 'fail' }];
          }
          return [200, { success: true }];
        });

      await nklient.get('http://example.com/max-delay')
        .retry({
          attempts: 4,
          delay: 50,
          maxDelay: 80,
          backoffMultiplier: 2,
          retryOnStatusCodes: [503]
        })
        .exec();

      expect(timestamps).to.have.length(4);
      // Third retry delay should be capped at 80ms (not 200ms)
      const delay3 = timestamps[3] - timestamps[2];
      expect(delay3).to.be.below(120); // Should be ~80ms, not 200ms
    });
  });

  describe('Retry with createClient', () => {
    it('should use client-level retry configuration', async () => {
      const client = nklient.createClient({
        retry: {
          attempts: 2,
          delay: 10,
          retryOnStatusCodes: [503]
        }
      });

      let attempts = 0;
      nock('http://example.com')
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
      expect(response.body).to.deep.equal({ success: true });
      expect(attempts).to.equal(2);
    });

    it('should allow per-request retry override', async () => {
      const client = nklient.createClient({
        retry: {
          attempts: 1,
          delay: 10,
          retryOnStatusCodes: [503]
        }
      });

      let attempts = 0;
      nock('http://example.com')
        .get('/retry-override')
        .times(3)
        .reply(() => {
          attempts++;
          if (attempts < 3) {
            return [503, { error: 'Service unavailable' }];
          }
          return [200, { success: true }];
        });

      // Override with more attempts
      const response = await client.get('http://example.com/retry-override')
        .retry({ attempts: 3, delay: 10, backoffMultiplier: 1, retryOnStatusCodes: [503] })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(attempts).to.equal(3);
    });
  });

  describe('Retry on Network Errors', () => {
    it('should retry on connection errors', async () => {
      let attempts = 0;
      nock('http://example.com')
        .get('/conn-error')
        .replyWithError('connect ECONNREFUSED')
        .get('/conn-error')
        .reply(200, { success: true });

      const response = await nklient.get('http://example.com/conn-error')
        .retry({ attempts: 2, delay: 10, backoffMultiplier: 1, retryOnStatusCodes: [503] })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ success: true });
    });
  });

  describe('No Retry Configuration', () => {
    it('should not retry when retry is not configured', async () => {
      let attempts = 0;
      nock('http://example.com')
        .get('/no-retry')
        .reply(() => {
          attempts++;
          return [503, { error: 'Service unavailable' }];
        });

      const response = await nklient.get('http://example.com/no-retry').exec();

      expect(response.statusCode).to.equal(503);
      expect(attempts).to.equal(1);
    });
  });
});

/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const nock = require('nock');
const nklient = require('../index');

describe('Timeout Granularity', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('Connect Timeout', () => {
    it('should timeout on slow connections', async () => {
      nock('http://example.com')
        .get('/slow-connect')
        .delayConnection(300)
        .reply(200);

      try {
        await nklient.get('http://example.com/slow-connect')
          .timeout({ connect: 50 })
          .exec();
        expect.fail('Should have timed out');
      } catch (error) {
        expect(error.code).to.be.oneOf(['ETIMEDOUT', 'ECONNABORTED']);
      }
    });
  });

  describe('Response Timeout', () => {
    it('should timeout on slow response body', async () => {
      nock('http://example.com')
        .get('/slow-response')
        .delayBody(300)
        .reply(200, 'slow data');

      try {
        await nklient.get('http://example.com/slow-response')
          .timeout({ response: 50 })
          .exec();
        expect.fail('Should have timed out');
      } catch (error) {
        expect(error.code).to.be.oneOf(['ETIMEDOUT', 'ECONNABORTED']);
      }
    });
  });

  describe('Overall Timeout', () => {
    it('should still support simple timeout as number', async () => {
      nock('http://example.com')
        .get('/simple')
        .delayConnection(300)
        .reply(200);

      try {
        await nklient.get('http://example.com/simple')
          .timeout(50)
          .exec();
        expect.fail('Should have timed out');
      } catch (error) {
        expect(error.message).to.equal('Request timeout');
      }
    });

    it('should use overall timeout from object form', async () => {
      nock('http://example.com')
        .get('/overall')
        .delayConnection(300)
        .reply(200);

      try {
        await nklient.get('http://example.com/overall')
          .timeout({ overall: 50 })
          .exec();
        expect.fail('Should have timed out');
      } catch (error) {
        expect(error.code).to.be.oneOf(['ETIMEDOUT', 'ECONNABORTED']);
      }
    });
  });

  describe('Timeout with createClient', () => {
    it('should use client-level timeout object', async () => {
      const client = nklient.createClient({
        timeout: 50
      });

      nock('http://example.com')
        .get('/slow')
        .delayConnection(300)
        .reply(200);

      try {
        await client.get('http://example.com/slow').exec();
        expect.fail('Should have timed out');
      } catch (error) {
        expect(error.message).to.equal('Request timeout');
      }
    });
  });
});

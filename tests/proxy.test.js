/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const nock = require('nock');
const nklient = require('../index');

describe('Proxy Support', () => {
  afterEach(() => {
    nock.cleanAll();
    nklient.clearProxyAgents();
  });

  describe('Proxy Agent Creation', () => {
    it('should create and cache HTTP proxy agents', async () => {
      nock('http://example.com')
        .get('/test')
        .reply(200, { data: 'proxied' });

      // The proxy won't actually route through a proxy in tests (nock intercepts)
      // but we verify the agent is created and cached
      const response = await nklient.get('http://example.com/test')
        .proxy('http://proxy.local:8080')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(nklient.getProxyAgentCacheSize()).to.be.at.least(1);
    });

    it('should reuse cached proxy agents', async () => {
      nock('http://example.com')
        .get('/test1')
        .reply(200, { data: 'first' });

      nock('http://example.com')
        .get('/test2')
        .reply(200, { data: 'second' });

      await nklient.get('http://example.com/test1')
        .proxy('http://proxy.local:8080')
        .exec();

      const sizeBefore = nklient.getProxyAgentCacheSize();

      await nklient.get('http://example.com/test2')
        .proxy('http://proxy.local:8080')
        .exec();

      const sizeAfter = nklient.getProxyAgentCacheSize();

      // Same proxy URL should reuse the cached agent
      expect(sizeAfter).to.equal(sizeBefore);
    });

    it('should create HTTPS proxy agents for HTTPS targets', async () => {
      nock('https://secure.example.com')
        .get('/test')
        .reply(200, { data: 'secure-proxied' });

      const response = await nklient.get('https://secure.example.com/test')
        .proxy('http://proxy.local:8080')
        .exec();

      expect(response.statusCode).to.equal(200);
    });

    it('should clear proxy agent cache', async () => {
      nock('http://example.com')
        .get('/test')
        .reply(200, { data: 'test' });

      await nklient.get('http://example.com/test')
        .proxy('http://proxy.local:8080')
        .exec();

      expect(nklient.getProxyAgentCacheSize()).to.be.at.least(1);

      nklient.clearProxyAgents();
      expect(nklient.getProxyAgentCacheSize()).to.equal(0);
    });
  });

  describe('Proxy with createClient', () => {
    it('should work with client-created requests', async () => {
      const client = nklient.createClient({
        baseUrl: 'http://api.example.com'
      });

      nock('http://api.example.com')
        .get('/data')
        .reply(200, { result: 'client-proxied' });

      const response = await client.get('/data')
        .proxy('http://proxy.local:8080')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.deep.equal({ result: 'client-proxied' });
    });
  });
});

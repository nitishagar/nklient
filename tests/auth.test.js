/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const nock = require('nock');
const nklient = require('../index');

describe('Authentication Helpers', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('Basic Auth', () => {
    it('should add Basic auth header', async () => {
      const expectedAuth = 'Basic ' + Buffer.from('user:pass').toString('base64');

      const scope = nock('http://example.com')
        .matchHeader('authorization', expectedAuth)
        .get('/protected')
        .reply(200, { authenticated: true });

      const response = await nklient.get('http://example.com/protected')
        .auth('user', 'pass')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should handle special characters in credentials', async () => {
      const expectedAuth = 'Basic ' + Buffer.from('user@domain:p@ss:w0rd!').toString('base64');

      const scope = nock('http://example.com')
        .matchHeader('authorization', expectedAuth)
        .get('/special')
        .reply(200);

      const response = await nklient.get('http://example.com/special')
        .auth('user@domain', 'p@ss:w0rd!')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should work with createClient', async () => {
      const client = nklient.createClient({
        baseUrl: 'http://api.example.com'
      });

      const expectedAuth = 'Basic ' + Buffer.from('admin:secret').toString('base64');

      const scope = nock('http://api.example.com')
        .matchHeader('authorization', expectedAuth)
        .get('/admin')
        .reply(200, { admin: true });

      const response = await client.get('/admin')
        .auth('admin', 'secret')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Bearer Token', () => {
    it('should add Bearer token header', async () => {
      const scope = nock('http://example.com')
        .matchHeader('authorization', 'Bearer my-jwt-token')
        .get('/api')
        .reply(200, { data: 'secured' });

      const response = await nklient.get('http://example.com/api')
        .bearerToken('my-jwt-token')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should override manually set auth header', async () => {
      const scope = nock('http://example.com')
        .matchHeader('authorization', 'Bearer override-token')
        .get('/api')
        .reply(200);

      const response = await nklient.get('http://example.com/api')
        .headers('Authorization', 'Basic old-auth')
        .bearerToken('override-token')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });
});

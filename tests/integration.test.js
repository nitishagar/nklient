/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const nklient = require('../index');
const http = require('http');

describe('Integration Tests', () => {
  let server;
  let serverUrl;

  before((done) => {
    // Create a simple HTTP server for integration tests
    server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${server.address().port}`);
      
      if (url.pathname === '/slow') {
        // Simulate slow response
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'slow response' }));
        }, 200);
      } else if (url.pathname === '/redirect') {
        // Simulate redirect
        res.writeHead(302, { 'Location': '/final' });
        res.end();
      } else if (url.pathname === '/final') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'final destination' }));
      } else if (url.pathname === '/redirect-loop') {
        // Simulate redirect loop
        res.writeHead(302, { 'Location': '/redirect-loop' });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'success' }));
      }
    });

    server.listen(0, () => {
      serverUrl = `http://localhost:${server.address().port}`;
      done();
    });
  });

  after((done) => {
    server.close(done);
  });

  describe('Timeout Scenarios', () => {
    it('should handle timeout with real network delay', async () => {
      try {
        await nklient.get(`${serverUrl}/slow`)
          .timeout(100)
          .exec();
        expect.fail('Should have timed out');
      } catch (error) {
        expect(error.code).to.equal('ETIMEDOUT');
      }
    });
  });

  describe('Redirect Scenarios', () => {
    it('should handle redirects with real server', async () => {
      const response = await nklient.get(`${serverUrl}/redirect`)
        .maxRedirects(5)
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body.message).to.equal('final destination');
    });

    it('should handle redirect limit with real server', async () => {
      try {
        await nklient.get(`${serverUrl}/redirect-loop`)
          .maxRedirects(3)
          .exec();
        expect.fail('Should have exceeded redirect limit');
      } catch (error) {
        expect(error.message).to.include('Maximum redirects exceeded');
      }
    });
  });

  describe('Real HTTP Server Interactions', () => {
    it('should make successful requests to real server', async () => {
      const response = await nklient.get(`${serverUrl}/`)
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body.message).to.equal('success');
    });

    it('should handle POST requests to real server', async () => {
      const response = await nklient.post(`${serverUrl}/`)
        .json({ test: 'data' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body.message).to.equal('success');
    });

    it('should handle headers with real server', async () => {
      const response = await nklient.get(`${serverUrl}/`)
        .headers('X-Custom-Header', 'test-value')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body.message).to.equal('success');
    });
  });

  describe('Error Handling with Real Server', () => {
    it('should handle connection refused errors', async () => {
      try {
        await nklient.get('http://localhost:99999/')
          .timeout(1000)
          .exec();
        expect.fail('Should have failed to connect');
      } catch (error) {
        expect(error.code).to.equal('ECONNREFUSED');
      }
    });
  });
});

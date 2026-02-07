/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const nock = require('nock');
const nklient = require('../index');
const { Readable } = require('stream');

describe('Streaming Support', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('Stream Response', () => {
    it('should return a readable stream when stream() is used', async () => {
      nock('http://example.com')
        .get('/stream')
        .reply(200, 'stream response data', {
          'content-type': 'text/plain'
        });

      const response = await nklient.get('http://example.com/stream')
        .stream()
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(response.body).to.be.instanceOf(Readable);

      // Consume the stream
      const chunks = [];
      for await (const chunk of response.body) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      expect(body).to.equal('stream response data');
    });

    it('should not auto-parse JSON when streaming', async () => {
      nock('http://example.com')
        .get('/stream-json')
        .reply(200, JSON.stringify({ key: 'value' }), {
          'content-type': 'application/json'
        });

      const response = await nklient.get('http://example.com/stream-json')
        .stream()
        .exec();

      expect(response.body).to.be.instanceOf(Readable);

      const chunks = [];
      for await (const chunk of response.body) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      // Should get raw JSON string, not parsed
      expect(body).to.equal('{"key":"value"}');
    });

    it('should still buffer when stream() is not used', async () => {
      nock('http://example.com')
        .get('/no-stream')
        .reply(200, { data: 'buffered' });

      const response = await nklient.get('http://example.com/no-stream').exec();

      expect(response.statusCode).to.equal(200);
      // Body should be parsed JSON, not a stream
      expect(response.body).to.deep.equal({ data: 'buffered' });
    });

    it('should handle stream with decompression', async () => {
      const zlib = require('zlib');
      const originalData = 'compressed stream data';
      const compressed = zlib.gzipSync(originalData);

      nock('http://example.com')
        .get('/stream-gzip')
        .reply(200, compressed, {
          'content-encoding': 'gzip',
          'content-type': 'text/plain'
        });

      const response = await nklient.get('http://example.com/stream-gzip')
        .stream()
        .exec();

      expect(response.body).to.be.instanceOf(Readable);

      const chunks = [];
      for await (const chunk of response.body) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      expect(body).to.equal(originalData);
    });
  });
});

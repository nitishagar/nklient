/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const nock = require('nock');
const nklient = require('../index');
const path = require('path');
const fs = require('fs');

describe('Multipart/Form-Data Support', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('Form Fields', () => {
    it('should send multipart form fields', async () => {
      const scope = nock('http://example.com')
        .post('/upload', body => {
          return body.includes('name') && body.includes('John');
        })
        .reply(200, { received: true });

      const response = await nklient.post('http://example.com/upload')
        .multipart({ name: 'John', age: '30' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should set correct content-type with boundary', async () => {
      const scope = nock('http://example.com')
        .matchHeader('content-type', /^multipart\/form-data; boundary=/)
        .post('/upload')
        .reply(200);

      const response = await nklient.post('http://example.com/upload')
        .multipart({ field: 'value' })
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('File Uploads', () => {
    it('should upload a file from buffer', async () => {
      const fileContent = Buffer.from('file contents here');

      const scope = nock('http://example.com')
        .post('/upload', body => {
          return body.includes('file contents here');
        })
        .reply(200, { uploaded: true });

      const response = await nklient.post('http://example.com/upload')
        .multipart({
          description: 'test file'
        })
        .attach('file', fileContent, 'test.txt')
        .exec();

      expect(response.statusCode).to.equal(200);
      expect(scope.isDone()).to.be.true;
    });

    it('should upload a file from stream', async () => {
      // Create a temp file
      const tmpFile = path.join(__dirname, 'test-upload.txt');
      fs.writeFileSync(tmpFile, 'stream file contents');

      try {
        const scope = nock('http://example.com')
          .post('/upload', body => {
            return body.includes('stream file contents');
          })
          .reply(200, { uploaded: true });

        const fileStream = fs.createReadStream(tmpFile);

        const response = await nklient.post('http://example.com/upload')
          .attach('file', fileStream, 'upload.txt')
          .exec();

        expect(response.statusCode).to.equal(200);
        expect(scope.isDone()).to.be.true;
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
    });

    it('should work with createClient', async () => {
      const client = nklient.createClient({
        baseUrl: 'http://api.example.com'
      });

      const scope = nock('http://api.example.com')
        .post('/files', body => {
          return body.includes('data');
        })
        .reply(201, { id: 1 });

      const response = await client.post('/files')
        .multipart({ data: 'metadata' })
        .exec();

      expect(response.statusCode).to.equal(201);
      expect(scope.isDone()).to.be.true;
    });
  });
});

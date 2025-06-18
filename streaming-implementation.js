// Streaming implementation for nklient

const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);

// Modified code sections for streaming support

// 1. Import statements to add:
/*
const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);
*/

// 2. Modified handle post data section (around line 109):
/*
    // Handle post data
    if (requestOptions.body) {
      const contentType = settings.headers['Content-Type'] || settings.headers['content-type'];
      
      // Check if body is a stream
      if (requestOptions.body && typeof requestOptions.body.pipe === 'function') {
        // For streams, we might not know the content length
        // Only set it if explicitly provided
        if (requestOptions.headers && requestOptions.headers['content-length']) {
          settings.headers['Content-Length'] = requestOptions.headers['content-length'];
        } else if (!settings.headers['Transfer-Encoding']) {
          // Use chunked encoding for streams without content-length
          settings.headers['Transfer-Encoding'] = 'chunked';
        }
      } else {
        let bodyData;
        if (typeof requestOptions.body === 'object' && !Buffer.isBuffer(requestOptions.body)) {
          bodyData = JSON.stringify(requestOptions.body);
          if (!contentType) {
            settings.headers['Content-Type'] = 'application/json';
          }
        } else {
          bodyData = requestOptions.body;
        }
        settings.headers['Content-Length'] = Buffer.byteLength(bodyData);
      }
    }
*/

// 3. Modified streaming response handling (around line 201):
/*
        // Handle streaming
        if (requestOptions.stream) {
          // Apply decompression to the stream if needed
          let streamBody = res;
          const encoding = res.headers['content-encoding'];
          
          if (requestOptions.decompress !== false && encoding) {
            if (encoding === 'gzip') {
              streamBody = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
              streamBody = res.pipe(zlib.createInflate());
            } else if (encoding === 'br') {
              streamBody = res.pipe(zlib.createBrotliDecompress());
            }
          }
          
          // Add helper methods to the stream
          streamBody.pipeToFile = async (filePath, options = {}) => {
            const fs = require('fs');
            const writeStream = fs.createWriteStream(filePath, options);
            await pipelineAsync(streamBody, writeStream);
            return filePath;
          };
          
          // Track download progress if handler is provided
          if (requestOptions.onDownloadProgress) {
            const originalPipe = streamBody.pipe;
            streamBody.pipe = function(destination, options) {
              let totalBytes = 0;
              const startTime = Date.now();
              const contentLength = res.headers['content-length'] ? parseInt(res.headers['content-length']) : undefined;
              
              this.on('data', chunk => {
                totalBytes += chunk.length;
                requestOptions.onDownloadProgress({
                  loaded: totalBytes,
                  total: contentLength,
                  progress: contentLength ? totalBytes / contentLength : undefined,
                  bytes: chunk.length,
                  rate: totalBytes / ((Date.now() - startTime) / 1000)
                });
              });
              
              return originalPipe.call(this, destination, options);
            };
          }
          
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: streamBody,
            request: {
              uri: requestOptions.uri,
              method: requestOptions.method,
              headers: settings.headers
            }
          });
          return;
        }
*/

// 4. Modified data collection with progress (around line 225):
/*
        // Collect response data
        const chunks = [];
        let totalBytes = 0;
        const startTime = Date.now();
        const contentLength = res.headers['content-length'] ? parseInt(res.headers['content-length']) : undefined;
        
        responseStream.on('data', chunk => {
          chunks.push(chunk);
          totalBytes += chunk.length;
          
          // Emit download progress if handler is provided
          if (requestOptions.onDownloadProgress) {
            requestOptions.onDownloadProgress({
              loaded: totalBytes,
              total: contentLength,
              progress: contentLength ? totalBytes / contentLength : undefined,
              bytes: chunk.length,
              rate: totalBytes / ((Date.now() - startTime) / 1000)
            });
          }
        });
*/

// 5. Modified request body sending (around line 262):
/*
      // Send request body
      if (requestOptions.body) {
        // Handle streaming request body
        if (requestOptions.body && typeof requestOptions.body.pipe === 'function') {
          // It's a stream
          let totalBytes = 0;
          const startTime = Date.now();
          
          // Track upload progress if handler is provided
          if (requestOptions.onUploadProgress) {
            requestOptions.body.on('data', chunk => {
              totalBytes += chunk.length;
              requestOptions.onUploadProgress({
                loaded: totalBytes,
                total: requestOptions.headers && requestOptions.headers['content-length'] ? parseInt(requestOptions.headers['content-length']) : undefined,
                progress: requestOptions.headers && requestOptions.headers['content-length'] ? totalBytes / parseInt(requestOptions.headers['content-length']) : undefined,
                bytes: chunk.length,
                rate: totalBytes / ((Date.now() - startTime) / 1000)
              });
            });
          }
          
          // Pipe the stream to the request
          requestOptions.body.pipe(req);
          requestOptions.body.on('error', err => {
            req.destroy();
            reject(err);
          });
          requestOptions.body.on('end', () => {
            req.end();
          });
        } else {
          // Handle non-stream bodies
          let bodyData;
          if (typeof requestOptions.body === 'object' && !Buffer.isBuffer(requestOptions.body)) {
            bodyData = JSON.stringify(requestOptions.body);
          } else {
            bodyData = requestOptions.body;
          }
          req.write(bodyData);
          req.end();
        }
      } else {
        req.end();
      }
*/

// 6. Modified body method in RequestWrapper (around line 351):
/*
  // Set request body (supports streams)
  body(data) {
    this.options.body = data;
    
    // If it's a stream and has readableLength, set content-length
    if (data && typeof data.pipe === 'function' && data.readableLength) {
      this.options.headers = this.options.headers || {};
      this.options.headers['content-length'] = data.readableLength;
    }
    
    return this;
  }
*/

// 7. New methods to add to RequestWrapper (before exec method):
/*
  // Set upload progress handler
  onUploadProgress(handler) {
    this.options.onUploadProgress = handler;
    return this;
  }

  // Set download progress handler
  onDownloadProgress(handler) {
    this.options.onDownloadProgress = handler;
    return this;
  }

  // Pipe response directly to a writable stream
  pipe(destination, options) {
    this.options.stream = true;
    return this.exec().then(response => {
      return response.body.pipe(destination, options);
    });
  }

  // Download response to a file
  async downloadToFile(filePath, options = {}) {
    this.options.stream = true;
    const response = await this.exec();
    await response.body.pipeToFile(filePath, options);
    return {
      statusCode: response.statusCode,
      headers: response.headers,
      filePath
    };
  }
*/

module.exports = {
  // Export the implementation details for reference
  pipelineAsync,
  streamingFeatures: {
    requestBodyStreaming: true,
    responseBodyStreaming: true,
    uploadProgress: true,
    downloadProgress: true,
    pipeToFile: true,
    chunkedTransferEncoding: true
  }
};
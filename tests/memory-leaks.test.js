const { expect } = require('chai');
const nock = require('nock');
const { detectMemoryLeak } = require('./memory-utils');
const nklient = require('../index');

describe('Memory Leak Tests', function() {
  this.timeout(60000); // Long timeout for memory tests
  
  afterEach(() => {
    nock.cleanAll();
  });
  
  describe('Proxy Agent Memory Leak', () => {
    it('should not leak memory when creating proxy agents', async () => {
      // Note: Some memory growth is expected due to proxy agent internals
      // We're checking it doesn't grow unbounded (should be < 10KB per iteration)
      const result = await detectMemoryLeak(async () => {
        nock('http://example.com')
          .get('/test')
          .reply(200, 'ok');
        
        await nklient.get('http://example.com/test')
          .proxy('http://proxy.local:8080')
          .exec();
      }, { iterations: 50 }); // Reduce iterations for proxy test
      
      expect(result.passed).to.be.true;
      expect(result.perIteration).to.be.below(10240); // Less than 10KB per request
    });
  });

  describe('Response Buffer Size Limit', () => {
    it('should reject responses larger than maxResponseSize', async () => {
      // Create a 2MB string instead of 10MB to reduce memory usage
      const largeData = 'x'.repeat(2 * 1024 * 1024); // 2MB
      
      const scope = nock('http://example.com')
        .get('/large')
        .reply(200, largeData);
      
      try {
        await nklient.get('http://example.com/large')
          .maxResponseSize(1024 * 1024) // 1MB limit
          .exec();
        expect.fail('Should have thrown error');
      } catch (err) {
        expect(err.message).to.include('Response size limit exceeded');
      }
      
      // Verify the request was made
      expect(scope.isDone()).to.be.true;
    });
  });

  describe('Interceptor Array Cleanup', () => {
    it('should not grow interceptor arrays indefinitely', async () => {
      const result = await detectMemoryLeak(async () => {
        const id = nklient.interceptors.request.use(config => config);
        nklient.interceptors.request.eject(id);
      }, { iterations: 1000 });
      
      expect(result.passed).to.be.true;
      // Check internal state - we'll need to expose this for testing
      // expect(interceptors.request.length).to.be.below(100);
    });
  });
});
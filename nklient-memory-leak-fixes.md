# nklient Memory Leak Fixes Implementation Plan

## Overview

Fix all identified memory leaks in nklient using Test-Driven Development (TDD) approach. Each leak will have a failing test written first, followed by the minimal fix to make it pass.

## Current State Analysis

The nklient library has 13 identified memory leak patterns:
1. Proxy agents created per request without reuse
2. Global cookie jar grows unbounded
3. Interceptor arrays never shrink after ejection
4. Response buffers have no size limits
5. Stream event listeners accumulate
6. Decompression streams lack error cleanup
7. Progress callbacks capture large closures
8. No agent connection cleanup
9. RequestWrapper options accumulate
10. Cookie expiration not handled
11. Retry mechanism holds failed requests
12. Stream pipe method override creates permanent closures
13. Long promise chains in makeRequest

## Desired End State

- All memory leaks fixed with comprehensive test coverage
- Memory usage remains stable during extended test runs
- Resource cleanup is automatic and verified
- No OOM errors when running the full test suite

## What We're NOT Doing

- Changing the public API
- Breaking backward compatibility
- Implementing memory profiling in production code
- Refactoring unrelated code

## Implementation Approach

Using strict TDD: Red-Green-Refactor cycle for each memory leak fix.

## Phase 1: Memory Testing Infrastructure

### Overview
Set up memory leak detection utilities and base test structure.

### Changes Required:

#### 1. Memory Test Utilities
**File**: `tests/memory-utils.js` (new)
**Changes**: Create utilities for memory leak detection

```javascript
const v8 = require('v8');
const { performance } = require('perf_hooks');

function forceGarbageCollection() {
  if (global.gc) {
    global.gc();
  }
}

function getHeapUsed() {
  return process.memoryUsage().heapUsed;
}

async function detectMemoryLeak(testFn, options = {}) {
  const iterations = options.iterations || 100;
  const threshold = options.threshold || 1024 * 1024; // 1MB default
  
  forceGarbageCollection();
  const initialHeap = getHeapUsed();
  
  for (let i = 0; i < iterations; i++) {
    await testFn();
  }
  
  forceGarbageCollection();
  await new Promise(resolve => setTimeout(resolve, 100));
  forceGarbageCollection();
  
  const finalHeap = getHeapUsed();
  const growth = finalHeap - initialHeap;
  
  return {
    passed: growth < threshold,
    growth,
    iterations,
    perIteration: growth / iterations
  };
}

module.exports = {
  forceGarbageCollection,
  getHeapUsed,
  detectMemoryLeak
};
```

#### 2. Memory Test Base
**File**: `tests/memory-leaks.test.js` (new)
**Changes**: Create base structure for memory tests

```javascript
const { expect } = require('chai');
const nock = require('nock');
const { detectMemoryLeak } = require('./memory-utils');
const nklient = require('../index');

describe('Memory Leak Tests', function() {
  this.timeout(60000); // Long timeout for memory tests
  
  afterEach(() => {
    nock.cleanAll();
  });
  
  // Individual leak tests will go here
});
```

### Success Criteria:

#### Automated Verification:
- [x] Memory utilities created: `test -f tests/memory-utils.js`
- [x] Memory test file created: `test -f tests/memory-leaks.test.js`
- [x] Tests run with --expose-gc: `NODE_OPTIONS="--expose-gc" npm test tests/memory-leaks.test.js`

---

## Phase 2: Critical Leak Tests & Fixes

### Overview
Fix the most critical unbounded growth issues: proxy agents, buffers, and interceptors.

### Changes Required:

#### 1. Proxy Agent Leak Test & Fix
**File**: `tests/memory-leaks.test.js`
**Changes**: Add test for proxy agent leak

```javascript
describe('Proxy Agent Memory Leak', () => {
  it('should not leak memory when creating proxy agents', async () => {
    const result = await detectMemoryLeak(async () => {
      nock('http://example.com')
        .get('/test')
        .reply(200, 'ok');
      
      await nklient.get('http://example.com/test')
        .proxy('http://proxy.local:8080')
        .exec();
    });
    
    expect(result.passed).to.be.true;
    expect(result.perIteration).to.be.below(1024); // Less than 1KB per request
  });
});
```

**File**: `index.js`
**Changes**: Implement proxy agent caching

```javascript
// Add at module level (after line 54)
const proxyAgents = new Map();

// Replace lines 102-107 with:
if (requestOptions.proxy) {
  const proxyKey = `${isHttps ? 'https' : 'http'}:${requestOptions.proxy}`;
  if (!proxyAgents.has(proxyKey)) {
    const ProxyAgent = isHttps ? HttpsProxyAgent : HttpProxyAgent;
    proxyAgents.set(proxyKey, new ProxyAgent(requestOptions.proxy));
  }
  settings.agent = proxyAgents.get(proxyKey);
} else {
  settings.agent = requestOptions.agent || agents[isHttps ? 'https' : 'http'];
}
```

#### 2. Response Buffer Size Limit Test & Fix
**File**: `tests/memory-leaks.test.js`
**Changes**: Add test for unbounded buffer growth

```javascript
describe('Response Buffer Size Limit', () => {
  it('should reject responses larger than maxResponseSize', async () => {
    const largeData = Buffer.alloc(10 * 1024 * 1024).toString(); // 10MB
    
    nock('http://example.com')
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
  });
});
```

**File**: `index.js`
**Changes**: Add maxResponseSize support

```javascript
// In RequestWrapper class, add method (after line 734):
maxResponseSize(bytes) {
  this.options.maxResponseSize = bytes;
  return this;
}

// In makeRequest function, modify response handling (around line 287):
const chunks = [];
let totalBytes = 0;
const maxSize = requestOptions.maxResponseSize || Infinity;

responseStream.on('data', chunk => {
  totalBytes += chunk.length;
  if (totalBytes > maxSize) {
    responseStream.destroy();
    const err = new Error(`Response size limit exceeded: ${totalBytes} > ${maxSize}`);
    err.code = 'ERESPONSETOOLARGE';
    reject(err);
    return;
  }
  chunks.push(chunk);
});
```

#### 3. Interceptor Array Cleanup Test & Fix
**File**: `tests/memory-leaks.test.js`
**Changes**: Add test for interceptor array growth

```javascript
describe('Interceptor Array Cleanup', () => {
  it('should not grow interceptor arrays indefinitely', async () => {
    const result = await detectMemoryLeak(async () => {
      const id = nklient.interceptors.request.use(config => config);
      nklient.interceptors.request.eject(id);
    }, { iterations: 1000 });
    
    expect(result.passed).to.be.true;
    expect(interceptors.request.length).to.be.below(100); // Should compact
  });
});
```

**File**: `index.js`
**Changes**: Implement array compaction

```javascript
// Replace eject methods (lines 794 and 803):
eject: id => {
  interceptors.request[id] = null;
  // Compact array if too many null entries
  const nullCount = interceptors.request.filter(i => i === null).length;
  if (nullCount > 10) {
    interceptors.request = interceptors.request.filter(i => i !== null);
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Proxy agent test passes: `NODE_OPTIONS="--expose-gc" npm test -- --grep "Proxy Agent Memory Leak"`
- [ ] Buffer limit test passes: `NODE_OPTIONS="--expose-gc" npm test -- --grep "Response Buffer Size Limit"`
- [ ] Interceptor test passes: `NODE_OPTIONS="--expose-gc" npm test -- --grep "Interceptor Array Cleanup"`
- [ ] Original tests still pass: `npm test`

---

## Phase 3: Stream & Event Listener Tests & Fixes

### Overview
Fix stream cleanup issues and event listener accumulation.

### Changes Required:

#### 1. Stream Error Cleanup Test & Fix
**File**: `tests/memory-leaks.test.js`
**Changes**: Add test for stream cleanup

```javascript
describe('Stream Error Cleanup', () => {
  it('should cleanup decompression streams on error', async () => {
    const result = await detectMemoryLeak(async () => {
      nock('http://example.com')
        .get('/compressed')
        .reply(200, 'invalid gzip data', {
          'content-encoding': 'gzip'
        });
      
      try {
        await nklient.get('http://example.com/compressed').exec();
      } catch (err) {
        // Expected error
      }
    });
    
    expect(result.passed).to.be.true;
  });
});
```

**File**: `index.js`
**Changes**: Add stream error cleanup

```javascript
// Modify decompression handling (around line 220):
if (requestOptions.decompress !== false && encoding) {
  let decompressStream;
  if (encoding === 'gzip') {
    decompressStream = zlib.createGunzip();
  } else if (encoding === 'deflate') {
    decompressStream = zlib.createInflate();
  } else if (encoding === 'br') {
    decompressStream = zlib.createBrotliDecompress();
  }
  
  if (decompressStream) {
    streamBody = res.pipe(decompressStream);
    // Cleanup on error
    decompressStream.on('error', err => {
      res.unpipe(decompressStream);
      decompressStream.destroy();
    });
  }
}
```

#### 2. Event Listener Cleanup Test & Fix
**File**: `tests/memory-leaks.test.js`
**Changes**: Add test for event listener cleanup

```javascript
describe('Event Listener Cleanup', () => {
  it('should not accumulate event listeners', async () => {
    const result = await detectMemoryLeak(async () => {
      nock('http://example.com')
        .get('/stream')
        .reply(200, function() {
          return require('stream').Readable.from(['data']);
        });
      
      const response = await nklient.get('http://example.com/stream')
        .stream()
        .onDownloadProgress(() => {})
        .exec();
      
      // Consume stream
      for await (const chunk of response.body) {
        // Process chunk
      }
    });
    
    expect(result.passed).to.be.true;
  });
});
```

**File**: `index.js`
**Changes**: Clean up progress listeners

```javascript
// Modify progress handling (around line 244):
if (requestOptions.onDownloadProgress) {
  const progressHandler = chunk => {
    totalBytes += chunk.length;
    // ... progress callback
  };
  
  streamBody.on('data', progressHandler);
  
  // Clean up on stream end/error
  streamBody.on('end', () => {
    streamBody.removeListener('data', progressHandler);
  });
  streamBody.on('error', () => {
    streamBody.removeListener('data', progressHandler);
  });
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Stream cleanup test passes: `NODE_OPTIONS="--expose-gc" npm test -- --grep "Stream Error Cleanup"`
- [ ] Event listener test passes: `NODE_OPTIONS="--expose-gc" npm test -- --grep "Event Listener Cleanup"`
- [ ] Streaming tests still work: `npm test -- --grep "streaming"`

---

## Phase 4: Global State Management Tests & Fixes

### Overview
Improve management of global state like cookie jars and agents.

### Changes Required:

#### 1. Cookie Jar Cleanup Test & Implementation
**File**: `tests/memory-leaks.test.js`
**Changes**: Add test for cookie jar cleanup

```javascript
describe('Cookie Jar Cleanup', () => {
  it('should provide methods to clean up cookies and agents', async () => {
    // Add many cookies
    for (let i = 0; i < 100; i++) {
      await nklient.setCookie(`test${i}=value${i}`, 'http://example.com');
    }
    
    const jarSizeBefore = (await nklient.getCookies('http://example.com')).length;
    expect(jarSizeBefore).to.be.above(50);
    
    // Clear cookies
    nklient.clearCookies();
    
    const jarSizeAfter = (await nklient.getCookies('http://example.com')).length;
    expect(jarSizeAfter).to.equal(0);
  });
});
```

**File**: `index.js`
**Changes**: Add cleanup methods

```javascript
// Add after existing clearCookies method (line 866):
nklient.clearProxyAgents = () => {
  proxyAgents.forEach(agent => {
    if (agent.destroy) agent.destroy();
  });
  proxyAgents.clear();
};

nklient.closeAgents = () => {
  if (agents.http.destroy) agents.http.destroy();
  if (agents.https.destroy) agents.https.destroy();
};

nklient.cleanup = () => {
  nklient.clearCookies();
  nklient.clearProxyAgents();
  nklient.closeAgents();
  interceptors.request = [];
  interceptors.response = [];
};
```

### Success Criteria:

#### Automated Verification:
- [ ] Cookie cleanup test passes: `NODE_OPTIONS="--expose-gc" npm test -- --grep "Cookie Jar Cleanup"`
- [ ] Cleanup methods exist: `npm test -- --grep "cleanup"`
- [ ] All memory tests pass together: `NODE_OPTIONS="--expose-gc" npm test tests/memory-leaks.test.js`

---

## Phase 5: Integration Testing

### Overview
Verify all fixes work together and the original OOM issue is resolved.

### Changes Required:

#### 1. Test Suite Memory Verification
**File**: `package.json`
**Changes**: Add memory test script

```json
{
  "scripts": {
    "test:memory": "NODE_OPTIONS=\"--expose-gc --max-old-space-size=512\" mocha ./tests/memory-leaks.test.js --timeout 60000",
    "test:oom": "NODE_OPTIONS=\"--expose-gc --max-old-space-size=512\" npm test"
  }
}
```

#### 2. Add Test Cleanup Hook
**File**: `tests/index.js`, `tests/createClient.test.js`, `tests/errorHandling.test.js`
**Changes**: Add nklient cleanup to afterEach

```javascript
afterEach(() => {
  nock.cleanAll();
  sinon.restore(); // if applicable
  nklient.clearCookies(); // Add this line
});

// Add at end of test file:
after(() => {
  nklient.cleanup(); // Full cleanup after all tests
});
```

### Success Criteria:

#### Automated Verification:
- [ ] Memory tests pass: `npm run test:memory`
- [ ] Full test suite passes with limited memory: `npm run test:oom`
- [ ] No memory growth detected: `NODE_OPTIONS="--expose-gc" npm test`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Test suite completes without OOM errors
- [ ] Memory usage remains stable during long test runs
- [ ] Performance is not significantly impacted

---

## Testing Strategy

### Unit Tests:
- Memory leak detection for each identified pattern
- Resource cleanup verification
- Size limit enforcement

### Integration Tests:
- Full test suite with memory constraints
- Long-running stress tests
- Concurrent request handling

### Manual Testing Steps:
1. Run test suite with 512MB heap limit
2. Monitor memory usage during test execution
3. Verify no OOM errors occur
4. Check that performance is acceptable

## Performance Considerations

- Proxy agent caching improves performance by reusing connections
- Array compaction has minimal overhead (only when many ejections)
- Stream cleanup adds negligible overhead
- Response size limits prevent malicious/accidental DoS

## References

- Original research: `research_2025-09-06_11-36-13_oom-test-analysis.md`
- Node.js memory management: https://nodejs.org/api/v8.html
- HTTP Agent documentation: https://nodejs.org/api/http.html#class-httpagent
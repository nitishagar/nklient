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

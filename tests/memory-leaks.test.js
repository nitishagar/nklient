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
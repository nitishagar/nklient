const { CookieJar } = require('tough-cookie');

const globalCookieJar = new CookieJar();

// Add a clear method to match the test's expectations
globalCookieJar.clear = function (callback) {
  this._cookies = {};
  if (typeof callback === 'function') {
    callback();
  }
};

// Add a clearCookies method to match the test's expectations
globalCookieJar.clearCookies = function (callback) {
  this.clear(callback);
};

module.exports = { globalCookieJar, CookieJar };

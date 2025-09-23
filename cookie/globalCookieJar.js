const { CookieJar } = require('tough-cookie');

const globalCookieJar = new CookieJar();

// Add a clearCookies method to match the test's expectations
globalCookieJar.clearCookies = function (callback) {
  this.clear();
  if (typeof callback === 'function') {
    callback();
  }
};

module.exports = { globalCookieJar, CookieJar };

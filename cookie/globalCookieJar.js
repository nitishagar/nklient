const { CookieJar } = require('tough-cookie');

const globalCookieJar = new CookieJar();

module.exports = { globalCookieJar, CookieJar };

/**
 * Checks if a content type header indicates JSON content
 * @param {string} contentType - Content-Type header value
 * @returns {boolean} True if content type is JSON
 * @example
 * isJSON('application/json') // true
 * isJSON('text/html') // false
 */
const isJSON = contentType => {
  if (!contentType) return false;
  return contentType.includes('application/json');
};

/**
 * Shallow merge objects into destination object
 * @param {Object} destination - Target object to merge into
 * @param {...Object} sources - Source objects to merge from
 * @returns {Object} The modified destination object
 * @example
 * const result = extend({a: 1}, {b: 2}, {c: 3});
 * // result = {a: 1, b: 2, c: 3}
 */
const extend = function (destination, ...sources) {
  for (const source of sources) {
    if (source) {
      for (const property in source) {
        destination[property] = source[property];
      }
    }
  }
  return destination;
};

module.exports = {
  extend,
  isJSON
};

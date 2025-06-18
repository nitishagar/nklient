const isJSON = contentType => {
  if (!contentType) return false;
  return contentType.includes('application/json');
};

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

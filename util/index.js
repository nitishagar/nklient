let isJSON = (str) => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

let extend = function(destination, source) {
    for (var property in source)
        destination[property] = source[property];
    return destination;
}

module.exports = {
    extend,
    isJSON
};
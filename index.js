const http = require('http');
const url = require('url');
const zlib = require('zlib');

// utils
const isJSON = require('./util').isJSON;
const extend = require('./util').extend;

const nklient = {};
const keepAliveAgent = new http.Agent({ keepAlive: true }); 

let client = (params, resolve, reject) => {
    let reqURI = url.parse(params.uri);
    var settings = {
        host: reqURI.hostname,
        port: reqURI.port || 80,
        path: params.newPath || reqURI.pathname,
        headers: params.headers || {},
        method: params.method || 'GET'
    };

    if (params.postData){
        settings.params = params.postData;
        settings.headers['Content-Length'] = params.postData.length;
    };

    let req = http.request(settings);

    if (settings.params) { req.write(settings.params); }
    if (params.timeout) { 
        req.setTimeout(params.timeout, () => {
            let err = new Error('ETIMEDOUT');
            err.code = 'ETIMEDOUT';
            reject(err);
        }); 
    }

    req.on('response', function(res){
        if (res.statusCode >= 300 && res.statusCode < 400 && 'location' in res.headers) {
            let newPath = res.headers.location;
            params.newPath = newPath;
            return client(params, resolve, reject);
        }

        let chunks = [];
        // concat chunks
        res.on('data', (chunk) => { 
            chunks.push(chunk);
        });

        // when the response has finished
        res.on('end', () => {
            res.body = Buffer.concat(chunks);
            let encoding = res.headers['content-encoding'];
            if (encoding === 'gzip') {
                zlib.gunzip(res.body, (err, decoded) => {
                    if (err) { reject(err); }
                    res.body = decoded && isJSON(decoded) ? JSON.parse(decoded.toString()) : decoded.toString();
                    resolve(res)
                });
            } else if (encoding === 'deflate') {
                zlib.inflate(res.body, (err, decoded) => (err, decoded) => {
                    if (err) { reject(err); }
                    res.body = decoded && isJSON(decoded) ? JSON.parse(decoded.toString()) : decoded.toString();
                    resolve(res)
                });
            } else {
                res.body = res.body.toString();
                res.body = isJSON(res.body) ? JSON.parse(res.body) : res.body;
                resolve(res);
            }
        });
    });

    // when err'd out
    req.on('error', (e) => reject(e));

    // end the request
    req.end();
}

let initParams = (uri, options) => {
  let params = {};
  if (typeof options === 'object') {
      options.uri = uri;
      return extend(params, options);
  } else if (typeof uri === 'string') {
      return extend(params, {uri: uri});
  }

  return extend(params, uri);
}

let verbFunc = (verb) => {
  let method = verb.toUpperCase();
  return (uri, options) => {
    nklient.options = extend(initParams(uri, options), {method});
    return nklient;
  }
}

nklient.get = verbFunc('get');
nklient.head = verbFunc('head');
nklient.post = verbFunc('post');
nklient.put = verbFunc('put');
nklient.patch = verbFunc('patch');
nklient.del = verbFunc('delete');

nklient.headers = (key, val) => {
    let headers = nklient.options.headers || {};
    headers[key] = val;
    extend(nklient.options, {headers});
    return nklient;
};

nklient.postBody = (body, encoding) => {
    if (typeof body === 'string' || body instanceof String) {
        extend(nklient.options, { postData: body, encoding: encoding || 'utf-8' })
    } else {
        extend(nklient.options, { postData: JSON.stringify(body), encoding: encoding || 'utf-8' }) 
    }
    return nklient;
}

nklient.timeout = (timeout) => {
    extend(nklient.options, {timeout});
    return nklient;
}

nklient.exec = () => new Promise((resolve, reject) => client(nklient.options, resolve, reject));

module.exports = nklient;
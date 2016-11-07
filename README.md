# nklient
Http request client in NodeJS

## Basic Usage
Simple promise based lib. for `GET`, `POST`, `PUT`, and `DELETE` functionality.

### GET example
```
const nklient = require('nklient');
const promisedResp = nklient.get('http://mockbin.com/request').headers('Accept', 'application/json').exec();

promiedResp.then((response) => {
  if (response.statusCode == 200) {
    console.log(response.body); //JSON
  }
}).catch((err) => console.error(err.message));
```

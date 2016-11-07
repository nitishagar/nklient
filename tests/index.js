var fs = require('fs')
var should = require('should')
var nklient = require('../index')

describe('Nklient', function () {
  describe('GET request', function () {
    it('should correctly parse JSON.', (done) => {
      nklient.get('http://mockbin.com/request').headers('Accept', 'application/json').exec().then((response) => {
        should(response.statusCode).equal(200);
        should(response.body).have.type('object');
        done();
      })
    })

    it('should correctly parse GZIPPED data.', (done) => {
      nklient.get('http://mockbin.com/gzip/request').headers('Accept-Encoding', 'gzip').exec().then(function (response) {
        should(response.statusCode).equal(200)
        should(response.body).have.type('object')
        done()
      })
    })

    it('should correctly handle redirects.', (done) => {
      nklient.get('http://mockbin.com/redirect/302').timeout(2500).exec().then((response) => {
        should(response.statusCode).equal(200)
        should(response.body).equal('redirect finished')
        done()
      })
    })

    it('should correctly handle timeouts.', (done) => {
      nklient.get('http://mockbin.com/redirect/3').timeout(20).exec().then((response) => {
          console.log(response);
        response.error.should.exist
        response.error.code.should.equal('ETIMEDOUT')
        done()
      }).catch((err) => {console.log(err); done()})
    })

    it('should correctly handle timeouts with 3 retries.', (done) => {
      var retryCount = 0;
      nklient.get('http://mockbin.com/redirect/3')
        .timeout(20)
        .retry((response) => {
          retryCount++;
        })
        .exec().then((response) => {
          response.error.should.exist
          response.error.code.should.equal('ETIMEDOUT')
          should(retryCount).equal(3)
          done()
        })
    })
  })
})

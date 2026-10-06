'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {serveLaunchPreview} = require('../lib/launch-preview');
test('mobile verification endpoint is absent in production and rejects external or private frames', () => {
  const previous = process.env.VERCEL_ENV;
  const response = {writeHead(status, headers) {this.status=status;this.headers=headers;},end(body){this.body=body;}};
  try {
    process.env.VERCEL_ENV='production';
    assert.equal(serveLaunchPreview({method:'GET',url:'/__launch-preview'},response),false);
    process.env.VERCEL_ENV='preview';
    for (const page of ['https://example.com','//example.com','/dashboard/pro','/__launch-preview']) {
      assert.equal(serveLaunchPreview({method:'GET',url:'/__launch-preview?page='+encodeURIComponent(page)},response),true);
      assert.match(response.body,/src="\/"/);
      assert.match(response.body,/width:390px/);
      assert.equal(response.headers['X-Robots-Tag'],'noindex, nofollow');
    }
    serveLaunchPreview({method:'GET',url:'/__launch-preview?page=%2Fpro%2F42&width=1024'},response);
    assert.match(response.body,/src="\/pro\/42"/);
    assert.match(response.body,/width:1024px/);
  } finally { if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous; }
});

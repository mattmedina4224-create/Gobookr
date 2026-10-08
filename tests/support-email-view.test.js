'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {renderSupportEmail}=require('../lib/support-email-view');
test('support email renderer cannot execute HTML, load remote content or create clickable phishing links',()=>{
 const html=renderSupportEmail({subject:'<script>alert(1)</script>',sender:'<img src="https://tracker.invalid/pixel">',bodyText:'<iframe src="javascript:x"></iframe> https://phish.invalid/login',bodyHtml:'<script>ignored</script>',attachments:[{url:'https://bad.invalid/malware.exe'}]});
 assert.ok(!/<(?:script|img|iframe|object|embed|a)\b/i.test(html));assert.ok(!/<[^>]*\s(?:href|src)=/i.test(html));assert.match(html,/&lt;script&gt;/);assert.match(html,/Sender \(unverified\)/);assert.ok(!html.includes('malware.exe'));assert.ok(!html.includes('ignored'));
});
test('support email view bounds untrusted content and strips direction-control characters',()=>{
 const html=renderSupportEmail({bodyText:'x'.repeat(40000)+'END',subject:'abc\u202Edef'});assert.ok(!html.includes('END'));assert.ok(!html.includes('\u202E'));assert.ok(html.length<31000);assert.match(renderSupportEmail(null),/No plain-text message available/);
});

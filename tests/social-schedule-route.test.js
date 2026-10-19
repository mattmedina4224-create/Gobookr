'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Story schedule editor is connection gated',()=>{
 const route=read('routes/social-schedule.js');
 const metaRoute=read('routes/meta-connect.js');
 assert.match(metaRoute,/social-schedule/);
 assert.match(route,/Automatic Instagram Stories/);
 assert.match(route,/Save schedule/);
 assert.match(route,/eligible Instagram Business account/);
 assert.match(route,/08:00/);
 assert.match(route,/social_post_schedules/);
});

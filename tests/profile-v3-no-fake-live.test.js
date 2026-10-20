'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const js=fs.readFileSync(path.join(__dirname,'..','public','site-navigation.js'),'utf8');
assert(!js.includes('Real-time availability'), 'Do not claim real-time availability before provider integration');
assert(js.includes('posted by the professional today'), 'Posted openings must be clearly labeled');
assert(js.includes('connected booking page'), 'External scheduler fallback must be explicit');
console.log('profile-v3 availability truthfulness ok');

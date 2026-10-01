'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','routes','public.js'),'utf8');
test('free-text professional search includes structured services and categories',()=>{
  assert.match(src,/EXISTS \(SELECT 1 FROM services qs WHERE qs\.pro_id = pro_profiles\.id AND qs\.name LIKE \?/);
  assert.match(src,/EXISTS \(SELECT 1 FROM pro_categories qc WHERE qc\.pro_id = pro_profiles\.id AND REPLACE\(qc\.category, '_', ' '\) LIKE \?/);
  assert.match(src,/args\.push\(value, value, value, value, value\)/);
});

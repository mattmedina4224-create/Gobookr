'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {validate,run}=require('../scripts/stage-mysalon-suite');
const sample={source:'MY SALON Suite',distinct_professional_urls:2,profiles:[
{source_url:'https://www.mysalonsuite.com/members/abc123-jane-doe/',source_slug:'abc123-jane-doe',name_hint_unverified:'jane doe',category:null,booking_url:null},
{source_url:'https://www.mysalonsuite.com/members/def456-john-doe/',source_slug:'def456-john-doe',name_hint_unverified:'john doe',category:null,booking_url:null}
]};
test('accepts only original official member URLs',()=>{const rows=validate(sample);assert.equal(rows.length,2);assert.equal(rows[0][1],'abc123-jane-doe')});
test('rejects nonofficial source domains',()=>{const s=JSON.parse(JSON.stringify(sample));s.profiles[0].source_url='https://mysalonsuite.com.evil.example/members/abc123-jane-doe/';assert.throws(()=>validate(s),/Non-official/)});
test('rejects duplicate source URLs and fabricated category or booking',()=>{let s=JSON.parse(JSON.stringify(sample));s.profiles[1].source_url=s.profiles[0].source_url;assert.throws(()=>validate(s),/Duplicate/);s=JSON.parse(JSON.stringify(sample));s.profiles[0].category='stylist';assert.throws(()=>validate(s),/unverified/);s=JSON.parse(JSON.stringify(sample));s.profiles[0].booking_url='https://booksy.com/';assert.throws(()=>validate(s),/unverified/)});
test('rejects wrong declared counts and incomplete names',()=>{const s=JSON.parse(JSON.stringify(sample));s.distinct_professional_urls=1;assert.throws(()=>validate(s),/count differs/)});
test('dry run validates file without touching the DB',async()=>{const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const d=fs.mkdtempSync(path.join(os.tmpdir(),'mysalon-stage-'));try{const f=path.join(d,'audit.json');fs.writeFileSync(f,JSON.stringify(sample));const out=await run(f);assert.equal(out.source_rows,2);assert.equal(out.public_profiles_created,0);assert.equal(out.mode,'dry_run')}finally{fs.rmSync(d,{recursive:true,force:true})}});

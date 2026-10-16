'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {buildSearch,predicate}=require('../lib/specialty-search');
const schema=`CREATE TABLE pro_profiles(id INTEGER,business_name TEXT,professional_handle TEXT,workplace_name TEXT,bio TEXT,license_verified INTEGER,profile_photo_url TEXT,booking_url TEXT); CREATE TABLE services(id INTEGER,pro_id INTEGER,name TEXT); CREATE TABLE pro_categories(pro_id INTEGER,category TEXT);`;
function run(db,q){const s=buildSearch(q);const m=predicate('matched.name',s.variants);const sql=`SELECT pro_profiles.*, (${s.order}) AS search_score FROM pro_profiles WHERE ${s.where} ORDER BY search_score DESC,id DESC`;return db.prepare(sql).all(...s.orderArgs,...s.args);}
test('complete profile wins an equal relevance tie without beating stronger evidence',()=>{
 const db=new DatabaseSync(':memory:');db.exec(schema);
 const add=db.prepare('INSERT INTO pro_profiles VALUES (?,?,?,?,?,?,?,?)');
 add.run(1,'Complete','','','Balayage specialist with a detailed profile '.repeat(3),1,'/photo.jpg','https://book.example');
 add.run(2,'Sparse','','','Balayage specialist',0,'','');
 add.run(3,'Service Pro','','','',0,'','');
 db.prepare('INSERT INTO services VALUES (1,3,?)').run('Balayage');
 const rows=run(db,'balayage');
 assert.equal(rows[0].id,3,'actual service match remains strongest');
 assert.equal(rows[1].id,1,'quality breaks equal bio-match tie');
 assert.equal(rows[2].id,2);
 db.close();
});

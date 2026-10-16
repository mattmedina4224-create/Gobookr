'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {buildSearch,matches,explain,variants,predicate}=require('../lib/specialty-search');
const catalog=require('../lib/service-catalog');
function query(q) {
  const s=buildSearch(q);const m=predicate('matched.name',s.variants);
  return {sql:`SELECT pro_profiles.*, (SELECT matched.name FROM services matched WHERE matched.pro_id=pro_profiles.id AND ${m.sql} ORDER BY matched.id LIMIT 1) AS matched_service, (${s.order}) AS search_score FROM pro_profiles WHERE ${s.where} ORDER BY search_score DESC, id DESC LIMIT 200`,args:[...m.args,...s.orderArgs,...s.args]};
}
const schema='CREATE TABLE pro_profiles(id INTEGER, business_name TEXT, professional_handle TEXT, workplace_name TEXT, bio TEXT, license_verified INTEGER DEFAULT 0, profile_photo_url TEXT DEFAULT \'\', booking_url TEXT DEFAULT \'\'); CREATE TABLE services(id INTEGER, pro_id INTEGER, name TEXT); CREATE TABLE pro_categories(pro_id INTEGER, category TEXT);';
test('SQL matches spelling, punctuation, aliases and all important words; ranks real services first',()=>{
  const db=new DatabaseSync(':memory:');db.exec(schema);
  const add=db.prepare('INSERT INTO pro_profiles(id,business_name,professional_handle,workplace_name,bio) VALUES (?, ?, ?, ?, ?)');
  add.run(1,'Artist One','fine_ink','','I specialize in black and grey realism and fine-line tattoos.');
  add.run(2,'Artist Two','','','Realism tattoos in color.');
  add.run(3,'Service specialist','','','');db.prepare('INSERT INTO services VALUES (?, ?, ?)').run(1,3,'Black & gray realism tattoo');
  add.run(4,'Fade Pro','','','Bald fades and scar camouflage.');
  add.run(5,'Percent Pro','','','100% custom color');add.run(6,'Regular Pro','','','Custom color');
  const find=q=>{const s=query(q);return db.prepare(s.sql).all(...s.args);};
  assert.deepEqual(find('black gray realism').map(r=>r.id),[3,1]);
  assert.equal(find('black gray realism')[0].matched_service,'Black & gray realism tattoo');
  assert.deepEqual(find('fine line').map(r=>r.id),[1]);assert.deepEqual(find('skin fade').map(r=>r.id),[4]);
  assert.deepEqual(find('scar camouflage').map(r=>r.id),[4]);assert.deepEqual(find('@fine_ink').map(r=>r.id),[1]);
  assert.deepEqual(find('100%').map(r=>r.id),[5]);assert.deepEqual(find("' OR 1=1 --").map(r=>r.id),[]);
  assert.deepEqual(find('not a real specialty').map(r=>r.id),[]);
  db.prepare('UPDATE pro_profiles SET bio=? WHERE id=4').run('Now specializing in nail art');assert.equal(find('scar camouflage').length,0);db.close();
});
test('explanations use actual profile evidence, never infer a service from category',()=>{
  assert.equal(explain({matched_service:'Skin fade'},'bald fade'),'Service: Skin fade');
  assert.match(explain({bio:'I specialize in black and grey realism.'},'black gray realism'),/black and grey realism/);
  assert.equal(explain({bio:'',categories:['barber']},'skin fade'),'');
  assert.ok(matches('fine-line tattoos','fineline'));assert.ok(matches('Colour correction','color correction'));assert.ok(variants('black gray realism').length<=6);
});
test('catalog covers every category and leaves free text open',()=>{
  const {PROFESSIONAL_CATEGORIES}=require('../lib/pro-categories');
  assert.deepEqual([...new Set(catalog.entries.map(e=>e.category))].sort(),PROFESSIONAL_CATEGORIES.map(c=>c.value).sort());
  assert.ok(catalog.entries.length>=250);assert.equal(catalog.exhaustive,false);assert.deepEqual(variants('totally bespoke niche'),['totally bespoke niche']);
});
test('ranking query runs on Postgres with correct parameter order',async()=>{
  const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();await db.exec(schema);
  await db.exec("INSERT INTO pro_profiles(id,business_name,professional_handle,workplace_name,bio) VALUES (1,'Artist','','','Black and grey realism'),(2,'Service pro','','',''); INSERT INTO services VALUES (1,2,'Black & gray realism');");
  const s=query('black gray realism');let i=0;const rows=(await db.query(s.sql.replace(/\?/g,()=>'$'+(++i)),s.args)).rows;
  assert.deepEqual(rows.map(r=>r.id),[2,1]);await db.close();
});

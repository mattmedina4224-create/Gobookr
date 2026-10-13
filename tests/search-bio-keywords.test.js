'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const source = fs.readFileSync(require('node:path').join(__dirname, '../routes/public.js'), 'utf8');
const search = source.slice(source.indexOf("router.get('/search'"));
const queryBranch = search.split('\n').find(line => line.includes('const cleanQ'));
const escapeFunction = source.split('\n').find(line => line.startsWith('function likeValue'));

test('unlisted specialties match current bio text and preserve literal wildcard characters', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE pro_profiles (id INTEGER, business_name TEXT, professional_handle TEXT, workplace_name TEXT, bio TEXT); CREATE TABLE services (pro_id INTEGER, name TEXT); CREATE TABLE pro_categories (pro_id INTEGER, category TEXT);');
  db.prepare('INSERT INTO pro_profiles VALUES (?, ?, ?, ?, ?)').run(1, 'Test professional', '', '', 'I specialize in scar camouflage and 100% custom color.');
  db.prepare('INSERT INTO pro_profiles VALUES (?, ?, ?, ?, ?)').run(2, 'Other professional', '', '', 'I offer custom color.');
  const find = q => {
    const context = { q, sql: 'SELECT id FROM pro_profiles WHERE 1=1', args: [] };
    vm.runInNewContext(escapeFunction + '\n' + queryBranch, context);
    return db.prepare(context.sql).all(...context.args).map(row => row.id);
  };
  assert.deepEqual(find('SCAR CAMOUFLAGE'), [1]);
  assert.deepEqual(find('100%'), [1]);
  assert.deepEqual(find('unknown specialty'), []);
  assert.deepEqual(find("' OR 1=1 --"), []);
  db.prepare('UPDATE pro_profiles SET bio = ? WHERE id = 1').run('Now specializing in fine line tattoos.');
  assert.deepEqual(find('scar camouflage'), []);
  assert.deepEqual(find('fine line'), [1]);
  db.close();
});

'use strict';
const fs = require('node:fs'), crypto = require('node:crypto');
const { validateSchemaDocument } = require('../lib/schema-validation');
if (process.argv.length !== 4) {
  console.error('Usage: node scripts/validate-structured-data.js document.json schemaorg-current-https.jsonld');
  process.exit(2);
}
const document = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rawVocabulary = fs.readFileSync(process.argv[3], 'utf8');
const result = validateSchemaDocument(document, JSON.parse(rawVocabulary));
console.log(JSON.stringify({ ...result, vocabularySha256: crypto.createHash('sha256').update(rawVocabulary).digest('hex') }, null, 2));
process.exitCode = result.valid ? 0 : 1;

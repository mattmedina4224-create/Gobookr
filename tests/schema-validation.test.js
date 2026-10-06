'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { validateSchemaDocument } = require('../lib/schema-validation');
// Small vocabulary fixture tests checker mechanics, not a fake marketplace.
const type = (name, parent) => ({ '@id': `schema:${name}`, '@type': 'rdfs:Class', ...(parent ? { 'rdfs:subClassOf': { '@id': `schema:${parent}` } } : {}) });
const property = (name, domain, range) => ({ '@id': `schema:${name}`, '@type': 'rdf:Property', 'schema:domainIncludes': { '@id': `schema:${domain}` }, 'schema:rangeIncludes': { '@id': `schema:${range}` } });
const vocabulary = { '@graph': [type('Thing'), type('Person', 'Thing'), type('Organization', 'Thing'), type('AggregateRating', 'Thing'), property('name', 'Thing', 'Text'), property('aggregateRating', 'Organization', 'AggregateRating'), property('worksFor', 'Person', 'Organization')] };
test('schema checker rejects a Person aggregateRating and unknown property/type', () => {
  assert.equal(validateSchemaDocument({ '@type': 'Person', aggregateRating: { '@type': 'AggregateRating' } }, vocabulary).valid, false);
  assert.equal(validateSchemaDocument({ '@type': 'Person', inventedProperty: 'x' }, vocabulary).valid, false);
  assert.equal(validateSchemaDocument({ '@type': 'InventedType', name: 'x' }, vocabulary).valid, false);
});
test('schema checker allows inherited properties and correct nested object ranges', () => {
  const result = validateSchemaDocument({ '@context': 'https://schema.org', '@type': 'Person', name: 'Internal test', worksFor: { '@type': 'Organization', name: 'Internal test' } }, vocabulary);
  assert.equal(result.valid, true); assert.equal(result.nodesChecked, 2);
  assert.equal(validateSchemaDocument({ '@type': 'Person', worksFor: { '@type': 'Person' } }, vocabulary).valid, false);
});

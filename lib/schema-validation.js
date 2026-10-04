'use strict';

// Vocabulary linter, not Google's rich-results eligibility test. It checks
// known types/properties, property domains and typed-object ranges.
function validateSchemaDocument(document, vocabulary) {
  const terms = new Map(vocabulary['@graph'].map(term => [term['@id'], term]));
  const errors = []; let nodesChecked = 0, propertiesChecked = 0;
  const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
  const id = value => String(value).replace(/^https?:\/\/schema\.org\//, 'schema:').replace(/^(?!schema:)/, 'schema:');
  function ancestors(type, seen = new Set()) {
    if (seen.has(type)) return seen;
    seen.add(type);
    for (const parent of array(terms.get(type)?.['rdfs:subClassOf'])) if (parent['@id']) ancestors(parent['@id'], seen);
    return seen;
  }
  function walk(node, path) {
    if (Array.isArray(node)) { node.forEach((value, index) => walk(value, `${path}[${index}]`)); return; }
    if (!node || typeof node !== 'object') return;
    if (node['@context'] && !['https://schema.org', 'http://schema.org'].includes(node['@context'])) errors.push(`${path}: unsupported context`);
    if (node['@graph']) walk(node['@graph'], `${path}.@graph`);
    const types = array(node['@type']).map(id); const inherited = new Set(types.flatMap(type => [...ancestors(type)]));
    if (types.length) nodesChecked++;
    for (const type of types) if (!array(terms.get(type)?.['@type']).includes('rdfs:Class')) errors.push(`${path}: unknown type ${type}`);
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('@')) continue;
      propertiesChecked++;
      const property = terms.get(id(key));
      if (!property || !array(property['@type']).includes('rdf:Property')) errors.push(`${path}: unknown property ${key}`);
      else {
        const domains = array(property['schema:domainIncludes']).map(x => x['@id']);
        if (types.length && domains.length && !domains.some(domain => inherited.has(domain))) errors.push(`${path}.${key}: property not allowed on ${types.join(',')}`);
        const ranges = array(property['schema:rangeIncludes']).map(x => x['@id']);
        for (const entry of array(value)) {
          if (entry && typeof entry === 'object' && entry['@type']) {
            const childTypes = array(entry['@type']).map(id);
            if (ranges.length && !childTypes.some(type => ranges.some(range => ancestors(type).has(range)))) errors.push(`${path}.${key}: typed object outside property range`);
          }
        }
      }
      walk(value, `${path}.${key}`);
    }
  }
  walk(document, '$');
  return { valid: errors.length === 0, nodesChecked, propertiesChecked, errors,
    scope: 'Schema.org known types/properties, property domains, typed-object ranges; not rich-result eligibility or factual verification' };
}

module.exports = { validateSchemaDocument };

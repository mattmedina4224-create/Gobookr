#!/usr/bin/env node
'use strict';
// Colorado entry point kept for the existing workflow and docs. The importer is now state-generic:
// see scripts/import-state-shops.js (same rules, same output files, --state=CO by default here).
const importer = require('./import-state-shops');

if (require.main === module) importer.main(process.argv.slice(2), { state: 'CO', out: 'data/business-inventories/colorado-import' });
module.exports = importer;

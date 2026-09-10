'use strict';

// Legacy compatibility shim. The active public routes live in routes/public.js.
// Keeping this file free of old duplicated UI prevents stale branding or emoji
// markup from being reintroduced accidentally.
module.exports = require('./routes/public');

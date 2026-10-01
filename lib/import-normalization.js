'use strict';

const clean = (value) => String(value || '').trim();
const identity = (value) => clean(value).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const normalizeZip = (value) => {
  const match = clean(value).match(/^(\d{5})(?:-\d{4})?$/);
  return match ? match[1] : clean(value);
};
const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch (_) {
    return false;
  }
};

module.exports = { clean, identity, normalizeZip, isHttpUrl };

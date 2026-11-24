'use strict';
// Who a design or order belongs to, and the permanent link its QR code prints.
// Professionals → https://gobookr.com/pro/:id (their own profile; never a workplace association).
// Businesses    → https://gobookr.com/shop/:id.
// Printed codes always use the canonical production domain so a card printed from a preview build still works.
const db = () => require('../../db');
const { FRESH } = require('./store');

const CANONICAL = 'https://gobookr.com';
function qrTarget(owner) {
  const id = Number(owner && owner.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Unknown owner');
  if (owner.kind === 'pro') return `${CANONICAL}/pro/${id}`;
  if (owner.kind === 'shop') return `${CANONICAL}/shop/${id}`;
  throw new Error('Unknown owner kind');
}

// Every identity the signed-in user may order for: their own pro profile, and claimed shops they own.
function ownersFor(user) {
  if (!user) return [];
  const out = [];
  const pro = db().prepare(FRESH + 'SELECT id, business_name, workplace_name, city, state, contact_phone, contact_email, instagram_url, website_url, booking_url FROM pro_profiles WHERE user_id = ?').get(user.id);
  if (pro) out.push({ kind: 'pro', id: Number(pro.id), name: pro.business_name || user.name, profile: pro });
  const shops = db().prepare(FRESH + "SELECT id, name, city, state, street_address, suite, zip_code, phone, logo_url FROM shops WHERE owner_user_id = ? AND claim_status = 'claimed' ORDER BY id").all(user.id);
  for (const s of shops) out.push({ kind: 'shop', id: Number(s.id), name: s.name, profile: s });
  return out;
}
function resolveOwner(user, ref) {
  const [kind, id] = String(ref || '').split(':');
  return ownersFor(user).find((o) => o.kind === kind && o.id === Number(id)) || null;
}

module.exports = { qrTarget, ownersFor, resolveOwner, CANONICAL };

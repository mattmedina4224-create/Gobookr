'use strict';
// Business profiles: validation, bounded data loading, completion, free team invitations and image handling.
// Everything an owner enters is validated here so routes stay thin. Nothing in this module touches billing.
const crypto = require('node:crypto');
const db = require('../db');
const { SHOP_CATEGORY_LABELS } = require('./shop-categories');

const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const PHOTO_KINDS = { interior: 'Interior', exterior: 'Exterior', workstation: 'Workstations', product: 'Products', portfolio: 'Our work', other: 'Other' };
const AMENITIES = ['Walk-ins welcome', 'Appointments only', 'Wheelchair accessible', 'Free parking', 'Street parking', 'Public transit nearby',
  'Kid friendly', 'Wi-Fi', 'Complimentary drinks', 'Private rooms', 'Gift cards', 'Retail products', 'Contactless payment', 'Spanish spoken'];
const SOCIAL = {
  instagram: { label: 'Instagram', hosts: ['instagram.com'], handle: (h) => 'https://www.instagram.com/' + h + '/' },
  facebook: { label: 'Facebook', hosts: ['facebook.com', 'fb.com'], handle: (h) => 'https://www.facebook.com/' + h },
  tiktok: { label: 'TikTok', hosts: ['tiktok.com'], handle: (h) => 'https://www.tiktok.com/@' + h },
  youtube: { label: 'YouTube', hosts: ['youtube.com', 'youtu.be'], handle: (h) => 'https://www.youtube.com/@' + h },
  pinterest: { label: 'Pinterest', hosts: ['pinterest.com'], handle: (h) => 'https://www.pinterest.com/' + h + '/' },
};
const MAX_PHOTOS = 40;
const MAX_SERVICES = 120;
const MAX_TEAM = 200;
const INVITE_DAYS = 14;

class InputError extends Error {}
// db/index.js and the worker cache SELECTs for up to 30s per server instance. Owner-facing reads (dashboard,
// preview, invites) must reflect a save immediately, so they start with a CTE: only SQL beginning with SELECT is
// cached (the same convention lib/auth.js uses for the session's user record).
const FRESH = 'WITH fresh_read AS (SELECT 1) ';
const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanBlock = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

// Only absolute http(s) URLs with a real host are ever stored or rendered.
function safeUrl(value) {
  const s = clean(value, 2048);
  if (!s) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || u.username || u.password) return null;
    return u.toString();
  } catch { return null; }
}
const publicUrl = (value) => safeUrl(value) || '';

function socialUrl(network, value) {
  const spec = SOCIAL[network];
  const s = clean(value, 300);
  if (!spec || !s) return '';
  const handle = s.replace(/^@/, '');
  if (/^[A-Za-z0-9._-]{1,60}$/.test(handle) && !handle.includes('.com')) return spec.handle(handle);
  const url = safeUrl(s);
  if (!url) return null;
  const host = new URL(url).hostname.toLowerCase().replace(/^(www|m)\./, '');
  return spec.hosts.some((h) => host === h || host.endsWith('.' + h)) ? url : null;
}

function parseSocial(body) {
  const out = {};
  for (const network of Object.keys(SOCIAL)) {
    const v = socialUrl(network, body['social_' + network]);
    if (v === null) throw new InputError(`Enter a valid ${SOCIAL[network].label} link or handle.`);
    if (v) out[network] = v;
  }
  return out;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
function parseHours(body) {
  const hours = {};
  for (const [day, label] of DAYS) {
    if (body['hours_' + day + '_closed'] === '1' || body['hours_' + day + '_closed'] === 'on') { hours[day] = { closed: true }; continue; }
    const open = clean(body['hours_' + day + '_open'], 5), close = clean(body['hours_' + day + '_close'], 5);
    if (!open && !close) continue; // not listed
    if (!TIME.test(open) || !TIME.test(close)) throw new InputError(`Enter opening and closing times for ${label}.`);
    if (close <= open) throw new InputError(`${label}: closing time must be after opening time.`);
    hours[day] = { open, close };
  }
  return hours;
}
function formatTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
function hoursRows(hours) {
  const h = hours && typeof hours === 'object' ? hours : {};
  if (!Object.keys(h).length) return [];
  return DAYS.map(([day, label]) => ({ day, label, text: !h[day] ? 'Not listed' : h[day].closed ? 'Closed' : `${formatTime(h[day].open)} – ${formatTime(h[day].close)}` }));
}

function pickList(values, allowed, max) {
  const list = [].concat(values || []).map((v) => clean(v, 60)).filter(Boolean);
  return [...new Set(allowed ? list.filter((v) => allowed.includes(v)) : list)].slice(0, max);
}
function parseSpecialties(text) {
  return [...new Set(String(text || '').split(/[,\n]/).map((v) => clean(v, 40)).filter((v) => v.length >= 2))].slice(0, 12);
}

// Prices are only what the business types. Blank means "not listed".
function parsePrice(value) {
  const s = clean(value, 12).replace(/[$,\s]/g, '');
  if (!s) return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) throw new InputError('Enter a price like 45 or 45.50, or leave it blank.');
  return Math.round(Number(s) * 100);
}
function parseDuration(value) {
  const s = clean(value, 6);
  if (!s) return null;
  if (!/^\d{1,4}$/.test(s) || Number(s) < 5 || Number(s) > 1440) throw new InputError('Duration must be between 5 and 1440 minutes, or blank.');
  return Number(s);
}
function parseService(body) {
  const name = clean(body.name, 120);
  if (!name) throw new InputError('Give the service a name.');
  const category = SHOP_CATEGORY_LABELS[body.category] ? body.category : '';
  return { name, category, description: cleanBlock(body.description, 500), price_cents: parsePrice(body.price),
    price_type: body.price_type === 'from' ? 'from' : 'fixed', duration_minutes: parseDuration(body.duration) };
}
function formatPrice(s) {
  if (s.price_cents == null) return '';
  const amount = s.price_cents % 100 ? (s.price_cents / 100).toFixed(2) : String(s.price_cents / 100);
  return (s.price_type === 'from' ? 'From $' : '$') + amount;
}
function formatDuration(min) {
  if (!min) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? h + ' hr' : '', m ? m + ' min' : ''].filter(Boolean).join(' ');
}

// ---- data ---------------------------------------------------------------------------------------------------
// Owner = the claimed shop's owner_user_id. Owners with several shops pick one with ?shop=ID.
function ownedShops(userId) {
  return db.prepare(FRESH + "SELECT * FROM shops WHERE owner_user_id = ? AND claim_status = 'claimed' ORDER BY id").all(userId);
}
function ownedShop(userId, wantedId) {
  const shops = ownedShops(userId);
  const id = Number(wantedId);
  return { shop: (Number.isInteger(id) && shops.find((s) => Number(s.id) === id)) || shops[shops.length - 1] || null, shops };
}

// One page = at most five queries regardless of gallery or team size.
function loadProfile(shopId, { fresh = false } = {}) {
  const safeAll = (sql, ...params) => safeAllRaw((fresh ? FRESH : '') + sql, ...params);
  const categories = safeAll('SELECT category FROM shop_categories WHERE shop_id = ? ORDER BY category', shopId).map((r) => r.category);
  const photos = safeAll('SELECT * FROM shop_photos WHERE shop_id = ? ORDER BY sort_order, id LIMIT ?', shopId, MAX_PHOTOS);
  const services = safeAll('SELECT * FROM shop_services WHERE shop_id = ? ORDER BY sort_order, id LIMIT ?', shopId, MAX_SERVICES);
  // Always fresh: someone who leaves must disappear from the page immediately on every server instance.
  const team = safeAllRaw(FRESH + `SELECT p.id, p.business_name, p.professional_handle, p.category, p.profile_photo_url, p.booking_url, p.license_verified,
      p.initials, p.city, p.state, m.id AS membership_id, m.sort_order
    FROM shop_team_members m JOIN pro_profiles p ON p.id = m.pro_id
    WHERE m.shop_id = ? AND m.status = 'accepted' ORDER BY m.sort_order, m.accepted_at, m.id LIMIT ?`, shopId, MAX_TEAM);
  return { categories, photos, services, team };
}
function safeAllRaw(sql, ...params) {
  try { return db.prepare(sql).all(...params); } catch (err) { if (/does not exist/.test(String(err.message))) return []; throw err; }
}

function groupServices(services) {
  const groups = new Map();
  for (const s of services) {
    const key = s.category || '';
    if (!groups.has(key)) groups.set(key, { category: key, label: SHOP_CATEGORY_LABELS[key] || 'Services', items: [] });
    groups.get(key).items.push(s);
  }
  return [...groups.values()];
}

function completion(shop, counts) {
  const items = [
    { key: 'basics', label: 'Add your street address and phone', done: Boolean(shop.street_address && shop.phone), step: 1 },
    { key: 'logo', label: 'Upload your logo', done: Boolean(shop.logo_url), step: 2 },
    { key: 'cover', label: 'Add a cover photo', done: Boolean(shop.cover_url), step: 2 },
    { key: 'about', label: 'Describe what makes your business special', done: String(shop.description || '').length >= 80, step: 1 },
    { key: 'hours', label: 'Set your opening hours', done: Object.keys(shop.hours || {}).length >= 5, step: 1 },
    { key: 'services', label: 'List at least three services', done: counts.services >= 3, step: 3 },
    { key: 'photos', label: 'Add at least four photos', done: counts.photos >= 4, step: 4 },
    { key: 'team', label: 'Invite your team', done: counts.team + counts.pendingInvites > 0, step: 5 },
    { key: 'links', label: 'Add your website, booking link or social links', done: Boolean(shop.website_url || shop.booking_url || Object.keys(shop.social_links || {}).length), step: 1 },
    { key: 'publish', label: 'Publish your profile', done: Boolean(shop.profile_published_at), step: 6 },
  ];
  const done = items.filter((i) => i.done).length;
  return { percent: Math.round((100 * done) / items.length), items, next: items.filter((i) => !i.done) };
}

// ---- images ---------------------------------------------------------------------------------------------------
// Owners' browsers resize before upload; the server still checks the real file signature and size.
const IMAGE_TYPES = [
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/webp', ext: 'webp', test: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' },
];
function decodeImage(base64, maxBytes = 3 * 1024 * 1024) {
  const s = String(base64 || '');
  if (!s || s.length > Math.ceil(maxBytes * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) throw new InputError('Choose a JPG, PNG or WebP photo under 3 MB.');
  const data = Buffer.from(s, 'base64');
  const kind = IMAGE_TYPES.find((t) => t.test(data));
  if (!kind || data.length > maxBytes || data.length < 100) throw new InputError('Choose a JPG, PNG or WebP photo under 3 MB.');
  return { data, contentType: kind.type, ext: kind.ext };
}

function storageConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s+/g, '');
  return baseUrl && serviceKey ? { baseUrl, serviceKey } : null;
}
const BUCKET = 'portfolio'; // existing public bucket; shop media lives under shops/<id>/
async function uploadShopImage(shopId, purpose, image) {
  const config = storageConfig();
  if (!config) throw new InputError('Photo uploads are not configured on this server yet.');
  const objectPath = `shops/${Number(shopId)}/${purpose}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${image.ext}`;
  const res = await fetch(`${config.baseUrl}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { ...(config.serviceKey.startsWith('sb_secret_') ? {} : { authorization: 'Bearer ' + config.serviceKey }), apikey: config.serviceKey,
      'content-type': image.contentType, 'cache-control': '31536000', 'x-upsert': 'false' },
    body: image.data,
  });
  if (!res.ok) throw new Error('Storage upload failed: ' + res.status);
  return `${config.baseUrl}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}
async function deleteShopImage(shopId, url) {
  const config = storageConfig();
  const prefix = config && `${config.baseUrl}/storage/v1/object/public/${BUCKET}/shops/${Number(shopId)}/`;
  if (!prefix || !String(url || '').startsWith(prefix)) return; // never delete anything outside this shop's folder
  const objectPath = String(url).slice(`${config.baseUrl}/storage/v1/object/public/${BUCKET}/`.length);
  await fetch(`${config.baseUrl}/storage/v1/object/${BUCKET}/${objectPath}`, { method: 'DELETE', signal: AbortSignal.timeout(15000),
    headers: { ...(config.serviceKey.startsWith('sb_secret_') ? {} : { authorization: 'Bearer ' + config.serviceKey }), apikey: config.serviceKey } }).catch(() => {});
}

// ---- free team affiliation --------------------------------------------------------------------------------------
// A professional owns their side of the relationship: only they can accept an invitation, ask to join, or leave
// (leaving never needs the owner). An owner owns their roster: invite, approve a request, remove. Every change is a
// single status-guarded UPDATE, so concurrent actions (leave vs. remove, accept vs. cancel) cannot both apply.
// None of this touches subscriptions; optional paid sponsorship lives in lib/business-team.js.
const MAX_WORKPLACES = 10;      // accepted workplaces per professional
const MAX_OPEN_REQUESTS = 5;    // join requests waiting on owners, per professional
const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const lowerEmail = (v) => String(v || '').trim().toLowerCase();
function parseEmails(text) {
  const parts = String(text || '').split(/[\s,;]+/).map(lowerEmail).filter(Boolean);
  const valid = [], invalid = [];
  for (const e of [...new Set(parts)]) (e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? valid : invalid).push(e);
  if (valid.length > 25) throw new InputError('Invite up to 25 people at a time.');
  return { valid, invalid };
}
function invitesBlocked(shopId, email) {
  return Boolean(db.prepare(FRESH + `SELECT 1 AS b FROM shop_team_members m LEFT JOIN pro_profiles p ON p.id = m.pro_id LEFT JOIN users u ON u.id = p.user_id
    WHERE m.shop_id = ? AND m.invites_blocked AND (lower(m.email) = ? OR lower(u.email) = ?) LIMIT 1`).get(shopId, email, email));
}
// Owner invites. An invitation is only a request for consent; nobody appears on a page until they accept.
// Returns [{email, token|null, status}] — token only for new invitations (shown once, never stored).
function createInvites(shopId, emails, invitedBy) {
  const results = [];
  for (const email of emails) {
    if (invitesBlocked(shopId, email)) { results.push({ email, token: null, status: 'declines_invitations' }); continue; }
    // The professional already asked to join: inviting them is the owner's approval.
    const asked = db.prepare(`UPDATE shop_team_members SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
      WHERE shop_id = ? AND lower(email) = ? AND status = 'requested' RETURNING id`).get(shopId, email);
    if (asked) { results.push({ email, token: null, status: 'request_approved' }); continue; }
    const token = crypto.randomBytes(32).toString('base64url');
    const row = db.prepare(`INSERT INTO shop_team_members (shop_id, email, token_hash, invited_by, expires_at, last_sent_at, send_count)
      SELECT ?, ?, ?, ?, CURRENT_TIMESTAMP + INTERVAL '${INVITE_DAYS} days', CURRENT_TIMESTAMP, 1
      WHERE (SELECT count(*) FROM shop_team_members WHERE shop_id = ? AND status IN ('pending', 'requested', 'accepted')) < ?
      ON CONFLICT DO NOTHING RETURNING id`).get(shopId, email, tokenHash(token), invitedBy, shopId, MAX_TEAM);
    if (row) { results.push({ email, token, status: 'invited', id: row.id }); continue; }
    const existing = db.prepare(FRESH + "SELECT status FROM shop_team_members WHERE shop_id = ? AND lower(email) = ? AND status IN ('pending', 'accepted')").get(shopId, email);
    results.push({ email, token: null, status: existing ? (existing.status === 'accepted' ? 'already_member' : 'already_invited') : 'team_full' });
  }
  return results;
}
// Resending issues a fresh link and a fresh 14-day window; at most once per 10 minutes and 5 times in total.
function refreshInvite(shopId, memberId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const row = db.prepare(`UPDATE shop_team_members SET token_hash = ?, expires_at = CURRENT_TIMESTAMP + INTERVAL '${INVITE_DAYS} days',
      last_sent_at = CURRENT_TIMESTAMP, send_count = send_count + 1
    WHERE id = ? AND shop_id = ? AND status = 'pending' AND send_count < 5
      AND (last_sent_at IS NULL OR last_sent_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes') RETURNING email`).get(tokenHash(token), memberId, shopId);
  if (!row) throw new InputError('This invitation was sent recently or has been resent too many times. Try again later.');
  return { email: row.email, token };
}
function cancelInvite(shopId, memberId) {
  return db.prepare("UPDATE shop_team_members SET status = 'canceled', token_hash = NULL, ended_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ? AND status = 'pending' RETURNING id").get(memberId, shopId);
}
// Owners can take someone off their own roster. That ends the affiliation only: never the person's account,
// profile, portfolio, reviews or subscription.
function removeMember(shopId, memberId) {
  return db.prepare("UPDATE shop_team_members SET status = 'removed', token_hash = NULL, ended_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ? AND status = 'accepted' RETURNING id, pro_id").get(memberId, shopId);
}
function approveRequest(shopId, memberId) {
  return db.prepare(`UPDATE shop_team_members SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ? AND status = 'requested'
    AND (SELECT count(*) FROM shop_team_members x WHERE x.pro_id = shop_team_members.pro_id AND x.status = 'accepted') < ${MAX_WORKPLACES} RETURNING id`).get(memberId, shopId);
}
function rejectRequest(shopId, memberId) {
  return db.prepare("UPDATE shop_team_members SET status = 'rejected', ended_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ? AND status = 'requested' RETURNING id").get(memberId, shopId);
}
function teamForOwner(shopId) {
  return db.prepare(FRESH + `SELECT m.id, m.email, m.status, m.expires_at, m.invited_at, m.accepted_at, m.ended_at, m.send_count, m.last_sent_at, p.id AS pro_id, p.business_name, p.profile_photo_url, p.category, p.initials
    FROM shop_team_members m LEFT JOIN pro_profiles p ON p.id = m.pro_id
    WHERE m.shop_id = ? AND (m.status IN ('pending', 'requested', 'accepted') OR (m.status IN ('left', 'removed') AND m.ended_at > CURRENT_TIMESTAMP - INTERVAL '30 days'))
    ORDER BY m.status = 'accepted' DESC, m.status = 'requested' DESC, m.sort_order, m.ended_at DESC NULLS LAST, m.id LIMIT ?`).all(shopId, MAX_TEAM + 60);
}
function findInvite(token) {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(String(token || ''))) return null;
  return db.prepare(FRESH + `SELECT m.*, s.name AS shop_name, s.city AS shop_city, s.state AS shop_state, s.claim_status
    FROM shop_team_members m JOIN shops s ON s.id = m.shop_id WHERE m.token_hash = ?`).get(tokenHash(token)) || null;
}
function claimedPro(user) {
  const pro = user && user.role === 'pro' ? db.prepare(FRESH + "SELECT id, business_name FROM pro_profiles WHERE user_id = ? AND claim_status = 'claimed'").get(user.id) : null;
  if (!pro) throw new InputError('Set up or claim your GoBookr professional profile first, then try again.');
  return pro;
}
function workplaceCount(proId) {
  return Number(db.prepare(FRESH + "SELECT count(*) AS n FROM shop_team_members WHERE pro_id = ? AND status = 'accepted'").get(proId).n);
}
// Accepting links the professional's own claimed profile to the shop. It never touches subscriptions.
function acceptInviteRow(user, invite) {
  if (!invite || invite.status !== 'pending' || new Date(invite.expires_at) < new Date() || invite.claim_status !== 'claimed') throw new InputError('This invitation has expired or is no longer available. Ask the business to send a new one.');
  if (lowerEmail(user.email) !== lowerEmail(invite.email)) throw new InputError(`This invitation was sent to ${invite.email}. Sign in with that email to accept it.`);
  const pro = claimedPro(user);
  if (workplaceCount(pro.id) >= MAX_WORKPLACES) throw new InputError(`You can be connected to up to ${MAX_WORKPLACES} businesses. Leave one first.`);
  try {
    const row = db.prepare(`UPDATE shop_team_members SET status = 'accepted', pro_id = ?, accepted_at = CURRENT_TIMESTAMP, token_hash = NULL, invites_blocked = FALSE
      WHERE id = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP RETURNING shop_id`).get(pro.id, invite.id);
    if (!row) throw new InputError('This invitation has expired or is no longer available.');
    return row.shop_id;
  } catch (err) {
    if (err.code === '23505' || /uniq_shop_team_member_pro/.test(String(err.message))) { // already on this team
      db.prepare("UPDATE shop_team_members SET status = 'canceled', token_hash = NULL, ended_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").run(invite.id);
      return invite.shop_id;
    }
    throw err;
  }
}
const acceptInvite = (user, token) => acceptInviteRow(user, findInvite(token));
function inviteForUser(user, memberId) {
  return db.prepare(FRESH + `SELECT m.*, s.name AS shop_name, s.claim_status FROM shop_team_members m JOIN shops s ON s.id = m.shop_id
    WHERE m.id = ? AND m.status = 'pending' AND lower(m.email) = ?`).get(memberId, lowerEmail(user.email)) || null;
}
const acceptInviteById = (user, memberId) => acceptInviteRow(user, inviteForUser(user, memberId));
function declineInviteRow(user, invite, { block = false } = {}) {
  if (!invite || invite.status !== 'pending' || lowerEmail(user.email) !== lowerEmail(invite.email)) throw new InputError('This invitation is no longer available.');
  db.prepare("UPDATE shop_team_members SET status = 'declined', token_hash = NULL, ended_at = CURRENT_TIMESTAMP, invites_blocked = ? WHERE id = ? AND status = 'pending'").run(Boolean(block), invite.id);
  return invite.shop_id;
}
const declineInvite = (user, token, opts) => declineInviteRow(user, findInvite(token), opts);
const declineInviteById = (user, memberId, opts) => declineInviteRow(user, inviteForUser(user, memberId), opts);

// A professional asks to join a claimed business. The owner approves; until then nothing is public.
function requestToJoin(user, shopId) {
  const pro = claimedPro(user);
  const shop = db.prepare(FRESH + "SELECT id, name, claim_status, owner_user_id FROM shops WHERE id = ?").get(shopId);
  if (!shop || shop.claim_status !== 'claimed') throw new InputError('Only businesses that have claimed their GoBookr page can accept team requests.');
  if (Number(shop.owner_user_id) === Number(user.id)) throw new InputError('You manage this business. Add yourself from your business dashboard.');
  const email = lowerEmail(user.email);
  const open = db.prepare(FRESH + `SELECT id, status FROM shop_team_members WHERE shop_id = ? AND (pro_id = ? OR lower(email) = ?) AND status IN ('pending', 'requested', 'accepted')`).get(shopId, pro.id, email);
  if (open && open.status === 'accepted') throw new InputError(`You are already on ${shop.name}'s team.`);
  if (open && open.status === 'requested') throw new InputError(`Your request to join ${shop.name} is already waiting for the owner.`);
  if (open && open.status === 'pending') { acceptInviteById(user, open.id); return { status: 'joined', shop }; } // they already invited you
  if (workplaceCount(pro.id) >= MAX_WORKPLACES) throw new InputError(`You can be connected to up to ${MAX_WORKPLACES} businesses. Leave one first.`);
  const waiting = Number(db.prepare(FRESH + "SELECT count(*) AS n FROM shop_team_members WHERE pro_id = ? AND status = 'requested'").get(pro.id).n);
  if (waiting >= MAX_OPEN_REQUESTS) throw new InputError(`You have ${MAX_OPEN_REQUESTS} requests waiting. Cancel one or wait for a reply first.`);
  const recent = db.prepare(FRESH + "SELECT 1 AS r FROM shop_team_members WHERE shop_id = ? AND pro_id = ? AND status = 'rejected' AND ended_at > CURRENT_TIMESTAMP - INTERVAL '30 days'").get(shopId, pro.id);
  if (recent) throw new InputError(`${shop.name} declined a recent request. You can ask again 30 days after that reply.`);
  const row = db.prepare(`INSERT INTO shop_team_members (shop_id, email, pro_id, status, expires_at) VALUES (?, ?, ?, 'requested', CURRENT_TIMESTAMP + INTERVAL '60 days')
    ON CONFLICT DO NOTHING RETURNING id`).get(shopId, email, pro.id);
  if (!row) throw new InputError('That request could not be sent. Refresh and try again.');
  return { status: 'requested', shop, id: row.id };
}
function cancelRequest(proId, memberId) {
  return db.prepare("UPDATE shop_team_members SET status = 'canceled', ended_at = CURRENT_TIMESTAMP WHERE id = ? AND pro_id = ? AND status = 'requested' RETURNING id").get(memberId, proId);
}

// Leaving: immediate, no owner approval, only by the professional themself. Affiliation only — account, profile,
// portfolio, services, reviews, booking links and subscription are untouched. Optionally blocks future invitations.
function leaveShop(proId, memberId, { blockInvites = false } = {}) {
  return db.prepare(`UPDATE shop_team_members m SET status = 'left', ended_at = CURRENT_TIMESTAMP, token_hash = NULL, invites_blocked = ?
    FROM shops s WHERE m.id = ? AND m.pro_id = ? AND m.status = 'accepted' AND s.id = m.shop_id
    RETURNING m.id, m.shop_id, s.name AS shop_name, s.owner_user_id`).get(Boolean(blockInvites), memberId, proId);
}
function allowInvitesAgain(proId, memberId) {
  return db.prepare("UPDATE shop_team_members SET invites_blocked = FALSE WHERE id = ? AND pro_id = ? AND invites_blocked RETURNING id").get(memberId, proId);
}
// Everything on the professional's "My workplaces" page in one query: connections, their own join requests,
// invitations addressed to their email, and the last 90 days of departures.
function proWorkplaces(proId, email) {
  return db.prepare(FRESH + `SELECT m.id, m.shop_id, m.status, m.invited_at, m.accepted_at, m.ended_at, m.expires_at, m.invites_blocked,
      s.name, s.city, s.state, s.neighborhood, s.logo_url, s.profile_published_at, s.claim_status
    FROM shop_team_members m JOIN shops s ON s.id = m.shop_id
    WHERE (m.pro_id = ? AND (m.status IN ('accepted', 'requested') OR (m.status IN ('left', 'removed', 'rejected') AND m.ended_at > CURRENT_TIMESTAMP - INTERVAL '90 days') OR m.invites_blocked))
       OR (lower(m.email) = ? AND m.status = 'pending' AND m.expires_at > CURRENT_TIMESTAMP)
    ORDER BY CASE m.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 WHEN 'requested' THEN 2 ELSE 3 END, m.accepted_at DESC NULLS LAST, m.ended_at DESC NULLS LAST
    LIMIT 100`).all(proId, lowerEmail(email));
}
// Back-compat name used by earlier routes/tests.
const proMemberships = (proId) => db.prepare(FRESH + `SELECT m.id, m.shop_id, m.accepted_at, s.name, s.city, s.state FROM shop_team_members m JOIN shops s ON s.id = m.shop_id
    WHERE m.pro_id = ? AND m.status = 'accepted' ORDER BY m.accepted_at DESC`).all(proId);
function teamRelationship(user, shopId) {
  if (!user || user.role !== 'pro') return null;
  const pro = db.prepare(FRESH + "SELECT id FROM pro_profiles WHERE user_id = ? AND claim_status = 'claimed'").get(user.id);
  if (!pro) return null;
  return db.prepare(FRESH + `SELECT id, status FROM shop_team_members WHERE shop_id = ? AND (pro_id = ? OR lower(email) = ?) AND status IN ('pending', 'requested', 'accepted') LIMIT 1`)
    .get(shopId, pro.id, lowerEmail(user.email)) || { status: 'none' };
}
// Owners hear about departures: an in-dashboard notice always, plus email when email is configured.
async function notifyOwnerOfDeparture({ memberId, shopId, shopName, ownerUserId, proName, origin }) {
  const owner = ownerUserId ? db.prepare('SELECT email FROM users WHERE id = ?').get(ownerUserId) : null;
  let delivery = 'not_configured';
  if (owner && process.env.RESEND_API_KEY && process.env.PROFILE_EMAIL_FROM) {
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    try {
      const res = await fetch('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.PROFILE_EMAIL_FROM, to: [owner.email], subject: `${proName} left ${shopName} on GoBookr`,
          text: `${proName} is no longer listed on your GoBookr business page. Professionals can change workplaces at any time.\n\nYour team: ${origin}/dashboard/shop?shop=${shopId}&tab=team`,
          html: `<p><strong>${esc(proName)}</strong> is no longer listed on your GoBookr business page. Professionals can change workplaces at any time.</p><p><a href="${esc(origin)}/dashboard/shop?shop=${Number(shopId)}&amp;tab=team">View your team</a></p>` }) });
      delivery = res.ok ? 'sent' : 'failed';
    } catch (_) { delivery = 'failed'; }
  }
  if (delivery === 'sent') db.prepare('UPDATE shop_team_members SET owner_notified_at = CURRENT_TIMESTAMP WHERE id = ?').run(memberId);
  return delivery;
}

function inviteEmail({ shopName, link }) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return {
    subject: `${shopName} invited you to join their team on GoBookr`,
    text: `${shopName} invited you to appear on their GoBookr business page.\n\nAccept: ${link}\n\nJoining a business team is free and does not change your own GoBookr plan. The invitation expires in ${INVITE_DAYS} days.`,
    html: `<p><strong>${esc(shopName)}</strong> invited you to appear on their GoBookr business page.</p><p><a href="${esc(link)}">Review the invitation</a></p><p style="color:#5F677A">Joining a business team is free and does not change your own GoBookr plan. The invitation expires in ${INVITE_DAYS} days.</p>`,
  };
}
async function sendInviteEmail({ to, shopName, link }) {
  if (!process.env.RESEND_API_KEY || !process.env.PROFILE_EMAIL_FROM) return 'not_configured';
  try {
    const res = await fetch('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.PROFILE_EMAIL_FROM, to: [to], ...inviteEmail({ shopName, link }) }) });
    return res.ok ? 'sent' : 'failed';
  } catch (_) { return 'failed'; }
}

module.exports = {
  FRESH, DAYS, PHOTO_KINDS, AMENITIES, SOCIAL, MAX_PHOTOS, MAX_SERVICES, INVITE_DAYS, InputError,
  clean, cleanBlock, safeUrl, publicUrl, socialUrl, parseSocial, parseHours, hoursRows, formatTime, pickList, parseSpecialties,
  parsePrice, parseDuration, parseService, formatPrice, formatDuration, groupServices, completion,
  ownedShops, ownedShop, loadProfile, decodeImage, uploadShopImage, deleteShopImage,
  MAX_WORKPLACES, MAX_OPEN_REQUESTS, tokenHash, parseEmails, invitesBlocked, createInvites, refreshInvite, cancelInvite, removeMember, approveRequest, rejectRequest,
  teamForOwner, findInvite, acceptInvite, acceptInviteById, declineInvite, declineInviteById, requestToJoin, cancelRequest,
  proMemberships, proWorkplaces, leaveShop, allowInvitesAgain, teamRelationship, notifyOwnerOfDeparture, inviteEmail, sendInviteEmail,
};

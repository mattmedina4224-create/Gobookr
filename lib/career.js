'use strict';
// GoBookr Career Studio data layer.
//   Free for professionals: résumé, applying, their own applications and messages, workplace management.
//   Business Pro (lib/business-pro.js) for businesses: receiving applications, Hiring Inbox, messaging, job posts,
//   candidate statuses and hiring notifications.
// Every business-side read or write re-checks ownership AND entitlement in this module, so a route that forgets a
// check still cannot leak applicant data.
const db = require('../db');
const BP = require('./business-pro');
const { PROFESSIONAL_CATEGORIES } = require('./pro-categories');

const FRESH = 'WITH fresh_read AS (SELECT 1) ';
const WORK_TYPES = [['employee', 'Employee'], ['commission', 'Commission'], ['booth_rent', 'Booth rental'], ['suite_rental', 'Suite rental'], ['apprentice', 'Apprentice'], ['part_time', 'Part time']];
const STATUSES = [['new', 'New'], ['reviewing', 'Reviewing'], ['interview', 'Interview'], ['offer', 'Offer'], ['hired', 'Hired'], ['declined', 'Not moving forward'], ['withdrawn', 'Withdrawn']];
const OWNER_STATUSES = ['new', 'reviewing', 'interview', 'offer', 'hired', 'declined'];
class CareerError extends Error { constructor(message, code = 400) { super(message); this.code = code; } }

const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, n);
const block = (v, n) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
const json = (v, d) => { if (v == null) return d; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return d; } } return v; };
const categoryLabel = (c) => (PROFESSIONAL_CATEGORIES.find((x) => x.value === c) || {}).label || '';

// ---- professionals ---------------------------------------------------------------------------------------------
function proFor(user) {
  if (!user) return null;
  return db.prepare(FRESH + "SELECT id, business_name, workplace_name, city, state, category, profile_photo_url, user_id FROM pro_profiles WHERE user_id = ? AND claim_status = 'claimed'").get(user.id) || null;
}
function resumeFor(proId) {
  const r = db.prepare(FRESH + 'SELECT * FROM pro_resumes WHERE pro_id = ?').get(proId);
  if (!r) return null;
  for (const k of ['specialties', 'licenses', 'experience', 'education', 'work_types']) r[k] = json(r[k], []);
  r.open_to_work = r.open_to_work === true || r.open_to_work === 't';
  return r;
}
function readRows(body, prefix, fields, max) {
  const rows = [];
  for (let i = 0; i < max; i++) {
    const row = {}; let any = false;
    for (const [f, n] of fields) { const val = f === 'description' ? block(body[`${prefix}_${i}_${f}`], n) : clean(body[`${prefix}_${i}_${f}`], n); row[f] = val; if (val) any = true; }
    if (any) rows.push(row);
  }
  return rows;
}
function parseResume(body) {
  const headline = clean(body.headline, 120);
  if (headline.length < 3) throw new CareerError('Add a headline, like “Barber with 6 years of fades and beard work”.');
  const years = body.years_experience === '' || body.years_experience == null ? null : Number(body.years_experience);
  if (years !== null && (!Number.isInteger(years) || years < 0 || years > 60)) throw new CareerError('Years of experience must be a whole number from 0 to 60.');
  const specialties = String(body.specialties || '').split(/[,\n]/).map((s) => clean(s, 40)).filter(Boolean).slice(0, 12);
  const experience = readRows(body, 'exp', [['role', 80], ['workplace', 120], ['start', 7], ['end', 7], ['description', 600]], 6)
    .map((r) => ({ ...r, start: /^\d{4}(-\d{2})?$/.test(r.start) ? r.start : '', end: /^\d{4}(-\d{2})?$/.test(r.end) ? r.end : '' }));
  const licenses = readRows(body, 'lic', [['name', 80], ['state', 2]], 4).map((r) => ({ name: r.name, state: r.state.toUpperCase().replace(/[^A-Z]/g, ''), self_reported: true }));
  const education = readRows(body, 'edu', [['school', 120], ['program', 120], ['year', 4]], 4).map((r) => ({ ...r, year: /^\d{4}$/.test(r.year) ? r.year : '' }));
  const work_types = WORK_TYPES.map(([k]) => k).filter((k) => body[`wt_${k}`] === '1' || body[`wt_${k}`] === 'on');
  return { headline, summary: block(body.summary, 1500), years_experience: years, specialties, licenses, experience, education, work_types, preferred_cities: clean(body.preferred_cities, 160), open_to_work: body.open_to_work === '1' || body.open_to_work === 'on' };
}
function saveResume(proId, r) {
  db.prepare(`INSERT INTO pro_resumes (pro_id, headline, summary, years_experience, specialties, licenses, experience, education, work_types, preferred_cities, open_to_work)
    VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?)
    ON CONFLICT (pro_id) DO UPDATE SET headline = EXCLUDED.headline, summary = EXCLUDED.summary, years_experience = EXCLUDED.years_experience, specialties = EXCLUDED.specialties,
      licenses = EXCLUDED.licenses, experience = EXCLUDED.experience, education = EXCLUDED.education, work_types = EXCLUDED.work_types,
      preferred_cities = EXCLUDED.preferred_cities, open_to_work = EXCLUDED.open_to_work, updated_at = CURRENT_TIMESTAMP`)
    .run(proId, r.headline, r.summary, r.years_experience, JSON.stringify(r.specialties), JSON.stringify(r.licenses), JSON.stringify(r.experience), JSON.stringify(r.education), JSON.stringify(r.work_types), r.preferred_cities, r.open_to_work);
}
// What the business receives: the résumé plus public profile basics, frozen at the moment of applying.
function snapshot(pro, resume, user) {
  return { name: pro.business_name || '', category: categoryLabel(pro.category), city: pro.city || '', state: pro.state || '', profile_url: `/pro/${Number(pro.id)}`,
    email: user.email, headline: resume.headline, summary: resume.summary, years_experience: resume.years_experience, specialties: resume.specialties,
    licenses: resume.licenses, experience: resume.experience, education: resume.education, work_types: resume.work_types, preferred_cities: resume.preferred_cities, taken_at: new Date().toISOString() };
}

// ---- job posts --------------------------------------------------------------------------------------------------
function parseJob(body) {
  const title = clean(body.title, 100);
  if (title.length < 3) throw new CareerError('Give the opening a title, like “Barber, full time”.');
  const workType = WORK_TYPES.some(([k]) => k === body.work_type) ? body.work_type : 'employee';
  const category = PROFESSIONAL_CATEGORIES.some((c) => c.value === body.category) ? body.category : '';
  return { title, category, work_type: workType, compensation: clean(body.compensation, 120), description: block(body.description, 4000), requirements: block(body.requirements, 2000) };
}
function ownerShop(user, shopId) {
  return user ? db.prepare(FRESH + "SELECT * FROM shops WHERE id = ? AND owner_user_id = ? AND claim_status = 'claimed'").get(shopId, user.id) || null : null;
}
// Drafts are allowed on the free plan (preview); publishing needs Business Pro.
function saveJob(user, shopId, jobId, data) {
  if (!ownerShop(user, shopId)) throw new CareerError('You do not manage this business.', 403);
  if (jobId) {
    const row = db.prepare(`UPDATE job_posts SET title = ?, category = ?, work_type = ?, compensation = ?, description = ?, requirements = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ? RETURNING id`)
      .get(data.title, data.category, data.work_type, data.compensation, data.description, data.requirements, jobId, shopId);
    if (!row) throw new CareerError('That opening was not found.', 404);
    return Number(row.id);
  }
  const count = Number(db.prepare(FRESH + "SELECT COUNT(*) AS n FROM job_posts WHERE shop_id = ? AND status <> 'closed'").get(shopId).n);
  if (count >= 20) throw new CareerError('You can have up to 20 openings at a time. Close one first.');
  return Number(db.prepare('INSERT INTO job_posts (shop_id, title, category, work_type, compensation, description, requirements, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .get(shopId, data.title, data.category, data.work_type, data.compensation, data.description, data.requirements, user.id).id);
}
function setJobStatus(user, shopId, jobId, status) {
  if (status === 'open') { const gate = BP.canHire(user, shopId); if (!gate.ok) throw new CareerError(gate.code === 403 ? 'You do not manage this business.' : 'Publishing openings needs Business Pro.', gate.code); }
  else if (!ownerShop(user, shopId)) throw new CareerError('You do not manage this business.', 403);
  const row = db.prepare(`UPDATE job_posts SET status = ?, published_at = CASE WHEN ? = 'open' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE published_at END,
    closed_at = CASE WHEN ? = 'closed' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ? RETURNING id`).get(status, status, status, jobId, shopId);
  if (!row) throw new CareerError('That opening was not found.', 404);
}
function jobsForOwner(shopId) { return db.prepare(FRESH + 'SELECT j.*, (SELECT COUNT(*) FROM job_applications a WHERE a.job_post_id = j.id AND a.status <> \'withdrawn\') AS applicants FROM job_posts j WHERE j.shop_id = ? ORDER BY (j.status = \'closed\'), j.id DESC').all(shopId); }
// Public: an opening is visible only while open AND the business is entitled (lapsed businesses stop advertising).
function publicJob(jobId) {
  const job = db.prepare(FRESH + "SELECT j.*, s.name AS shop_name, s.city AS shop_city, s.state AS shop_state, s.logo_url FROM job_posts j JOIN shops s ON s.id = j.shop_id WHERE j.id = ? AND j.status = 'open'").get(jobId);
  if (!job || !BP.entitledShopIds([job.shop_id]).has(Number(job.shop_id))) return null;
  return job;
}
function openJobs({ city = '', category = '', shopId = null, limit = 60 } = {}) {
  const where = ["j.status = 'open'"], args = [];
  if (shopId) { where.push('j.shop_id = ?'); args.push(shopId); }
  if (city) { where.push('lower(s.city) = lower(?)'); args.push(clean(city, 80)); }
  if (category) { where.push('j.category = ?'); args.push(category); }
  const rows = db.prepare(FRESH + `SELECT j.*, s.name AS shop_name, s.city AS shop_city, s.state AS shop_state FROM job_posts j JOIN shops s ON s.id = j.shop_id WHERE ${where.join(' AND ')} ORDER BY j.published_at DESC LIMIT ?`).all(...args, Math.min(limit, 200) * 2);
  const ok = BP.entitledShopIds(rows.map((r) => r.shop_id));
  return rows.filter((r) => ok.has(Number(r.shop_id))).slice(0, limit);
}
// Does this business currently accept applications? (Business Pro active.)
function acceptsApplications(shopId) { return BP.entitledShopIds([shopId]).has(Number(shopId)); }

// ---- applications ----------------------------------------------------------------------------------------------
function apply({ user, shopId, jobId = null, note = '' }) {
  const pro = proFor(user);
  if (!pro) throw new CareerError('Applying is for professionals with a claimed GoBookr profile.', 403);
  const resume = resumeFor(pro.id);
  if (!resume || !resume.headline) throw new CareerError('Create your free résumé first.', 409);
  const shop = db.prepare(FRESH + "SELECT id, name, owner_user_id FROM shops WHERE id = ? AND claim_status = 'claimed'").get(shopId);
  if (!shop) throw new CareerError('That business is not on GoBookr yet.', 404);
  if (Number(shop.owner_user_id) === Number(user.id)) throw new CareerError('You cannot apply to your own business.');
  if (jobId) { const job = db.prepare(FRESH + "SELECT id FROM job_posts WHERE id = ? AND shop_id = ? AND status = 'open'").get(jobId, shopId); if (!job) throw new CareerError('That opening is closed.', 404); }
  if (!acceptsApplications(shopId)) throw new CareerError(`${shop.name} isn't accepting applications on GoBookr right now.`, 409);
  const recent = Number(db.prepare(FRESH + "SELECT COUNT(*) AS n FROM job_applications WHERE pro_id = ? AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 day'").get(pro.id).n);
  if (recent >= 15) throw new CareerError('You have sent a lot of applications today. Try again tomorrow.', 429);
  const row = db.prepare(`INSERT INTO job_applications (shop_id, job_post_id, pro_id, applicant_user_id, resume_snapshot, note) VALUES (?, ?, ?, ?, ?::jsonb, ?)
    ON CONFLICT (pro_id, shop_id, COALESCE(job_post_id, 0)) WHERE status <> 'withdrawn' DO NOTHING RETURNING id`)
    .get(shopId, jobId, pro.id, user.id, JSON.stringify(snapshot(pro, resume, user)), block(note, 1500));
  if (!row) throw new CareerError('You already applied here. Your application is in your Career Studio.', 409);
  notify(shop.owner_user_id, 'application', `${pro.business_name || 'A professional'} applied to ${shop.name}`, `/dashboard/shop/hiring/applications/${row.id}?shop=${shopId}`, row.id);
  return Number(row.id);
}
function withdraw(user, appId) {
  const pro = proFor(user); if (!pro) throw new CareerError('Not allowed.', 403);
  const row = db.prepare("UPDATE job_applications SET status = 'withdrawn', status_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, business_unread = TRUE WHERE id = ? AND pro_id = ? AND status NOT IN ('withdrawn', 'hired') RETURNING id, shop_id").get(appId, pro.id);
  if (!row) throw new CareerError('That application cannot be withdrawn.', 404);
}
const APP_COLS = 'a.id, a.shop_id, a.job_post_id, a.pro_id, a.status, a.note, a.business_unread, a.pro_unread, a.created_at, a.updated_at, a.status_changed_at';
// Owner inbox: full applicant data only when entitled; otherwise only a count (no names, no résumés).
function inbox(user, shopId, { status = '', jobId = null } = {}) {
  const gate = BP.canHire(user, shopId);
  if (gate.code === 403 || gate.code === 401) throw new CareerError('You do not manage this business.', 403);
  if (!gate.ok) {
    const n = Number(db.prepare(FRESH + "SELECT COUNT(*) AS n FROM job_applications WHERE shop_id = ? AND status <> 'withdrawn'").get(shopId).n);
    return { locked: true, savedCount: n, entitlement: gate.entitlement, items: [] };
  }
  const where = ['a.shop_id = ?'], args = [shopId];
  if (STATUSES.some(([k]) => k === status)) { where.push('a.status = ?'); args.push(status); } else where.push("a.status <> 'withdrawn'");
  if (jobId) { where.push('a.job_post_id = ?'); args.push(jobId); }
  const items = db.prepare(FRESH + `SELECT ${APP_COLS}, a.resume_snapshot, j.title AS job_title,
      (SELECT COUNT(*) FROM application_messages m WHERE m.application_id = a.id) AS message_count
    FROM job_applications a LEFT JOIN job_posts j ON j.id = a.job_post_id WHERE ${where.join(' AND ')} ORDER BY a.business_unread DESC, a.updated_at DESC LIMIT 200`).all(...args)
    .map((r) => ({ ...r, resume_snapshot: json(r.resume_snapshot, {}) }));
  const counts = Object.fromEntries(db.prepare(FRESH + 'SELECT status, COUNT(*) AS n FROM job_applications WHERE shop_id = ? GROUP BY status').all(shopId).map((r) => [r.status, Number(r.n)]));
  return { locked: false, items, counts, entitlement: gate.entitlement };
}
function applicationForOwner(user, shopId, appId) {
  const gate = BP.canHire(user, shopId);
  if (!gate.ok) throw new CareerError(gate.code === 403 ? 'You do not manage this business.' : 'Your hiring tools are paused. Restart Business Pro to open applications.', gate.code === 403 ? 403 : 402);
  const app = db.prepare(FRESH + `SELECT ${APP_COLS}, a.resume_snapshot, j.title AS job_title FROM job_applications a LEFT JOIN job_posts j ON j.id = a.job_post_id WHERE a.id = ? AND a.shop_id = ?`).get(appId, shopId);
  if (!app) throw new CareerError('Application not found.', 404);
  app.resume_snapshot = json(app.resume_snapshot, {});
  if (app.business_unread === true || app.business_unread === 't') db.prepare('UPDATE job_applications SET business_unread = FALSE WHERE id = ?').run(appId);
  return { app, messages: messages(appId) };
}
function applicationForPro(user, appId) {
  const pro = proFor(user); if (!pro) throw new CareerError('Not allowed.', 403);
  const app = db.prepare(FRESH + `SELECT ${APP_COLS}, a.resume_snapshot, j.title AS job_title, s.name AS shop_name, s.city AS shop_city FROM job_applications a JOIN shops s ON s.id = a.shop_id LEFT JOIN job_posts j ON j.id = a.job_post_id WHERE a.id = ? AND a.pro_id = ?`).get(appId, pro.id);
  if (!app) throw new CareerError('Application not found.', 404);
  app.resume_snapshot = json(app.resume_snapshot, {});
  if (app.pro_unread === true || app.pro_unread === 't') db.prepare('UPDATE job_applications SET pro_unread = FALSE WHERE id = ?').run(appId);
  return { app, messages: messages(appId), businessActive: acceptsApplications(app.shop_id) };
}
function applicationsForPro(user) {
  const pro = proFor(user); if (!pro) return [];
  return db.prepare(FRESH + `SELECT ${APP_COLS}, j.title AS job_title, s.name AS shop_name, s.city AS shop_city FROM job_applications a JOIN shops s ON s.id = a.shop_id LEFT JOIN job_posts j ON j.id = a.job_post_id WHERE a.pro_id = ? ORDER BY a.updated_at DESC LIMIT 100`).all(pro.id);
}
function messages(appId) { return db.prepare(FRESH + 'SELECT id, sender, body, created_at FROM application_messages WHERE application_id = ? ORDER BY id LIMIT 500').all(appId); }
function setStatus(user, shopId, appId, status) {
  if (!OWNER_STATUSES.includes(status)) throw new CareerError('Choose a valid status.');
  const gate = BP.canHire(user, shopId);
  if (!gate.ok) throw new CareerError(gate.code === 403 ? 'You do not manage this business.' : 'Your hiring tools are paused.', gate.code === 403 ? 403 : 402);
  const row = db.prepare("UPDATE job_applications SET status = ?, status_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, pro_unread = TRUE WHERE id = ? AND shop_id = ? AND status <> 'withdrawn' RETURNING applicant_user_id").get(status, appId, shopId);
  if (!row) throw new CareerError('That application cannot be updated.', 404);
  const shop = db.prepare('SELECT name FROM shops WHERE id = ?').get(shopId);
  notify(row.applicant_user_id, 'status', `${shop.name} updated your application: ${(STATUSES.find(([k]) => k === status) || [])[1]}`, `/dashboard/pro/career/applications/${appId}`, appId);
}
function sendMessage({ user, appId, body, as, shopId = null }) {
  const text = block(body, 4000);
  if (!text) throw new CareerError('Write a message first.');
  let app, recipient;
  if (as === 'business') {
    const gate = BP.canHire(user, shopId);
    if (!gate.ok) throw new CareerError(gate.code === 403 ? 'You do not manage this business.' : 'Messaging applicants needs Business Pro.', gate.code === 403 ? 403 : 402);
    app = db.prepare(FRESH + 'SELECT id, shop_id, applicant_user_id, status FROM job_applications WHERE id = ? AND shop_id = ?').get(appId, shopId);
    if (!app) throw new CareerError('Application not found.', 404);
    recipient = app.applicant_user_id;
  } else {
    const pro = proFor(user); if (!pro) throw new CareerError('Not allowed.', 403);
    app = db.prepare(FRESH + 'SELECT a.id, a.shop_id, a.status, s.owner_user_id FROM job_applications a JOIN shops s ON s.id = a.shop_id WHERE a.id = ? AND a.pro_id = ?').get(appId, pro.id);
    if (!app) throw new CareerError('Application not found.', 404);
    if (!acceptsApplications(app.shop_id)) throw new CareerError('This business isn’t receiving messages on GoBookr right now.', 409);
    recipient = app.owner_user_id;
  }
  if (app.status === 'withdrawn') throw new CareerError('This application was withdrawn.', 409);
  const recentCount = Number(db.prepare(FRESH + "SELECT COUNT(*) AS n FROM application_messages WHERE sender_user_id = ? AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'").get(user.id).n);
  if (recentCount >= 60) throw new CareerError('You are sending messages too quickly. Try again later.', 429);
  db.prepare('INSERT INTO application_messages (application_id, sender, sender_user_id, body) VALUES (?, ?, ?, ?)').run(appId, as === 'business' ? 'business' : 'pro', user.id, text);
  db.prepare(`UPDATE job_applications SET updated_at = CURRENT_TIMESTAMP, ${as === 'business' ? 'pro_unread' : 'business_unread'} = TRUE WHERE id = ?`).run(appId);
  const url = as === 'business' ? `/dashboard/pro/career/applications/${appId}` : `/dashboard/shop/hiring/applications/${appId}?shop=${app.shop_id}`;
  notify(recipient, 'message', as === 'business' ? 'New message from a business you applied to' : 'New message from an applicant', url, appId);
}

// ---- notifications ---------------------------------------------------------------------------------------------
function notify(userId, kind, title, url, appId = null) {
  if (!userId) return;
  db.prepare('INSERT INTO hiring_notifications (user_id, kind, title, url, application_id) VALUES (?, ?, ?, ?, ?)').run(userId, kind, clean(title, 200), url, appId);
  emailNotification(userId, title, url).catch(() => {});
}
async function emailNotification(userId, title, url) {
  if (!process.env.RESEND_API_KEY || !process.env.PROFILE_EMAIL_FROM) return 'not_configured';
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
  if (!user) return 'no_user';
  const link = `${String(process.env.APP_URL || 'https://gobookr.com').replace(/\/$/, '')}${url}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.PROFILE_EMAIL_FROM, to: [user.email], subject: title, text: `${title}\n\nOpen GoBookr: ${link}\n\nMessages stay on GoBookr; reply there.`, html: `<p>${esc(title)}</p><p><a href="${esc(link)}">Open in GoBookr</a></p><p style="color:#5F677A">Messages stay on GoBookr; reply there.</p>` }) });
  return res.ok ? 'sent' : 'failed';
}
function notifications(user, limit = 20) { return user ? db.prepare(FRESH + 'SELECT * FROM hiring_notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(user.id, limit) : []; }
function unreadCount(user) { return user ? Number(db.prepare(FRESH + 'SELECT COUNT(*) AS n FROM hiring_notifications WHERE user_id = ? AND read_at IS NULL').get(user.id).n) : 0; }
function markRead(user) { if (user) db.prepare('UPDATE hiring_notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL').run(user.id); }

module.exports = {
  CareerError, WORK_TYPES, STATUSES, OWNER_STATUSES, categoryLabel,
  proFor, resumeFor, parseResume, saveResume, snapshot,
  parseJob, saveJob, setJobStatus, jobsForOwner, publicJob, openJobs, acceptsApplications, ownerShop,
  apply, withdraw, inbox, applicationForOwner, applicationForPro, applicationsForPro, setStatus, sendMessage,
  notify, notifications, unreadCount, markRead,
};

'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect } = require('../lib/http');
const { escapeHtml } = require('../lib/util');

function adminEmail() {
  return String(process.env.ADMIN_EMAIL || 'matt@novobarbers.com').trim().toLowerCase();
}

function requireAdmin(ctx) {
  const email = String((ctx.currentUser && ctx.currentUser.email) || '').trim().toLowerCase();
  if (!ctx.currentUser || !email || email !== adminEmail()) {
    redirect(ctx.res, '/login');
    return false;
  }
  return true;
}

module.exports = function (router) {
  router.get('/admin/licenses', async (ctx) => {
    if (!requireAdmin(ctx)) return;

    const pros = db.prepare(`
      SELECT id, business_name, city, state,
             license_number, license_state, license_verified
      FROM pro_profiles
      WHERE license_number IS NOT NULL AND trim(license_number) != ''
      ORDER BY license_verified ASC, business_name ASC
    `).all();

    const rows = pros.map((pro) => `
      <tr>
        <td>${escapeHtml(pro.business_name)}</td>
        <td>${escapeHtml(pro.city || '')}, ${escapeHtml(pro.state || '')}</td>
        <td>${escapeHtml(pro.license_number || '')}</td>
        <td>${escapeHtml(pro.license_state || '')}</td>
        <td>${pro.license_verified ? 'Verified' : 'Pending'}</td>
        <td>${String(pro.license_state || '').toUpperCase() === 'CO' ? `<a href="https://www.colorado.gov/myverification/" target="_blank" rel="noopener noreferrer">Open DORA</a> ` : ''}${pro.license_verified ? '' : `<form method="POST" action="/admin/licenses/${pro.id}/verify" style="display:inline"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" /><button type="submit">Verify</button></form>`}</td>
      </tr>
    `).join('');

    const body = `
      <section class="section container">
        <h1>License Verification</h1>
        <p class="muted">Review professional licenses submitted to GoBookr.</p>
        ${rows ? `<table>
          <thead><tr><th>Professional</th><th>Location</th><th>License #</th><th>State</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>` : '<div class="panel"><p class="muted" style="margin:0;">No licenses are waiting for review.</p></div>'}
      </section>
    `;

    send(ctx.res, layout({
      title: 'License Verification',
      currentUser: ctx.currentUser,
      session: ctx.session,
      body,
    }));
  });

  router.post('/admin/licenses/:id/verify', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const proId = Number(ctx.params.id);
    if (!Number.isInteger(proId) || proId <= 0) return redirect(ctx.res, '/admin/licenses');
    db.prepare('UPDATE pro_profiles SET license_verified = 1 WHERE id = ?').run(proId);
    redirect(ctx.res, '/admin/licenses');
  });
};

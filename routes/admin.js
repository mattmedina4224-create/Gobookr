'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect } = require('../lib/http');
const { escapeHtml } = require('../lib/util');

function requireAdmin(ctx) {
  if (
    !ctx.currentUser ||
    ctx.currentUser.email !== 'matt@novobarbers.com'
  ) {
    redirect(ctx.res, '/login');
    return false;
  }

  return true;
}

module.exports = function (router) {
  // Admin license verification dashboard
  router.get('/admin/licenses', async (ctx) => {
    if (!requireAdmin(ctx)) return;

    const pros = db.prepare(`
      SELECT id, business_name, city, state,
             license_number, license_state, license_verified
      FROM pro_profiles
      WHERE license_number IS NOT NULL
      ORDER BY license_verified ASC, business_name ASC
    `).all();

    const rows = pros.map((pro) => `
      <tr>
        <td>${escapeHtml(pro.business_name)}</td>
        <td>${escapeHtml(pro.city || '')}, ${escapeHtml(pro.state || '')}</td>
        <td>${escapeHtml(pro.license_number || '')}</td>
        <td>${escapeHtml(pro.license_state || '')}</td>
        <td>${pro.license_verified ? 'Verified' : 'Pending'}</td>
        <td>${pro.license_verified ? '' : `<form method="POST" action="/admin/licenses/${pro.id}/verify"><button type="submit">Verify</button></form>`}</td>
      </tr>
    `).join('');

    const body = `
      <section class="section container">
        <h1>License Verification</h1>
        <p class="muted">Review professional licenses submitted to GoBookr.</p>

        <table>
          <thead>
            <tr>
              <th>Professional</th>
              <th>Location</th>
              <th>License #</th>
              <th>State</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </section>
    `;

    send(ctx.res, layout({
      title: 'License Verification',
      body,
      user: ctx.currentUser
    }));
  });
  router.post('/admin/licenses/:id/verify', async (ctx) => {
    if (!requireAdmin(ctx)) return;

    db.prepare(
      'UPDATE pro_profiles SET license_verified = 1 WHERE id = ?'
    ).run(ctx.params.id);

    redirect(ctx.res, '/admin/licenses');
  });
}; 
  

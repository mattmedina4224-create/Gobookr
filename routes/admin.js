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
  router.get('/admin/shop-claims', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const claims = db.prepare(`SELECT sc.id, sc.shop_id, sc.claimant_user_id, sc.status, sc.requested_at,
      s.name AS shop_name, s.city, s.state, u.name AS claimant_name, u.email AS claimant_email
      FROM shop_claims sc JOIN shops s ON s.id=sc.shop_id JOIN users u ON u.id=sc.claimant_user_id
      WHERE sc.status='pending' ORDER BY sc.requested_at ASC`).all();
    const rows = claims.map(x => `<tr><td><a href="/shop/${x.shop_id}">${escapeHtml(x.shop_name)}</a></td><td>${escapeHtml(x.city)}, ${escapeHtml(x.state)}</td><td>${escapeHtml(x.claimant_name || '')}<br><span class="muted">${escapeHtml(x.claimant_email || '')}</span></td><td>${escapeHtml(String(x.requested_at || ''))}</td><td><form method="POST" action="/admin/shop-claims/${x.id}/approve" style="display:inline"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}"><button class="btn small" type="submit">Approve</button></form> <form method="POST" action="/admin/shop-claims/${x.id}/reject" style="display:inline"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}"><button class="btn ghost small" type="submit">Reject</button></form></td></tr>`).join('');
    send(ctx.res, layout({title:'Shop claims',currentUser:ctx.currentUser,session:ctx.session,body:`<section class="section container"><h1>Shop Claim Requests</h1><p class="muted">Verify business ownership before approving access.</p>${rows ? `<table><thead><tr><th>Shop</th><th>Location</th><th>Claimant</th><th>Requested</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="panel"><p class="muted" style="margin:0;">No shop claims are waiting for review.</p></div>'}</section>`}));
  });

  router.post('/admin/shop-claims/:id/approve', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const id=Number(ctx.params.id); if(!Number.isInteger(id)||id<=0) return redirect(ctx.res,'/admin/shop-claims');
    const claim=db.prepare("SELECT * FROM shop_claims WHERE id=? AND status='pending'").get(id); if(!claim) return redirect(ctx.res,'/admin/shop-claims');
    const existing=db.prepare("SELECT id FROM shops WHERE owner_user_id=? AND claim_status='claimed' AND id != ? LIMIT 1").get(claim.claimant_user_id,claim.shop_id);
    if(existing) return redirect(ctx.res,'/admin/shop-claims?error='+encodeURIComponent('That account already owns a claimed shop.'));
    db.prepare("UPDATE shop_claims SET status='approved', reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").run(id);
    db.prepare("UPDATE shops SET owner_user_id=?, claim_status='claimed', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(claim.claimant_user_id,claim.shop_id);
    db.prepare("UPDATE shop_claims SET status='rejected', reviewed_at=CURRENT_TIMESTAMP WHERE shop_id=? AND id != ? AND status='pending'").run(claim.shop_id,id);
    redirect(ctx.res,'/admin/shop-claims');
  });

  router.post('/admin/shop-claims/:id/reject', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const id=Number(ctx.params.id); if(Number.isInteger(id)&&id>0) {
      const claim=db.prepare("SELECT shop_id FROM shop_claims WHERE id=? AND status='pending'").get(id);
      db.prepare("UPDATE shop_claims SET status='rejected', reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").run(id);
      if(claim){ const remaining=db.prepare("SELECT id FROM shop_claims WHERE shop_id=? AND status='pending' LIMIT 1").get(claim.shop_id); if(!remaining) db.prepare("UPDATE shops SET claim_status='unclaimed', updated_at=CURRENT_TIMESTAMP WHERE id=? AND claim_status='pending'").run(claim.shop_id); }
    }
    redirect(ctx.res,'/admin/shop-claims');
  });
};

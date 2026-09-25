'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect } = require('../lib/http');
const { escapeHtml } = require('../lib/util');

const { requireAdmin } = require('../lib/admin');

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
    send(ctx.res, layout({title:'Business account claims',currentUser:ctx.currentUser,session:ctx.session,body:`<section class="section container"><h1>Business Account Claim Requests</h1><p class="muted">Verify business ownership before approving access.</p>${rows ? `<table><thead><tr><th>Shop</th><th>Location</th><th>Claimant</th><th>Requested</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="panel"><p class="muted" style="margin:0;">No business account claims are waiting for review.</p></div>'}</section>`}));
  });

  router.post('/admin/shop-claims/:id/approve', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const id=Number(ctx.params.id); if(!Number.isInteger(id)||id<=0) return redirect(ctx.res,'/admin/shop-claims');
    const claim=db.prepare("SELECT * FROM shop_claims WHERE id=? AND status='pending'").get(id); if(!claim) return redirect(ctx.res,'/admin/shop-claims');
    const existing=db.prepare("SELECT id FROM shops WHERE owner_user_id=? AND claim_status='claimed' AND id != ? LIMIT 1").get(claim.claimant_user_id,claim.shop_id);
    if(existing) return redirect(ctx.res,'/admin/shop-claims?error='+encodeURIComponent('That account already owns a claimed business.'));
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

  router.get('/admin/profile-claims', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const claims = db.prepare(`SELECT pc.id, pc.pro_id, pc.claimant_user_id, pc.status, pc.verification_method,
      pc.verification_evidence, pc.requested_at, p.business_name, p.workplace_name, p.city, p.state,
      u.name AS claimant_name, u.email AS claimant_email
      FROM profile_claims pc JOIN pro_profiles p ON p.id=pc.pro_id JOIN users u ON u.id=pc.claimant_user_id
      WHERE pc.status='pending' ORDER BY pc.requested_at ASC`).all();
    const rows = claims.map(x => `<tr><td><a href="/pro/${x.pro_id}"><strong>${escapeHtml(x.business_name)}</strong></a>${x.workplace_name ? '<br><span class="muted">'+escapeHtml(x.workplace_name)+'</span>' : ''}<br><span class="muted">${escapeHtml(x.city || '')}, ${escapeHtml(x.state || '')}</span></td><td>${escapeHtml(x.claimant_name || '')}<br><span class="muted">${escapeHtml(x.claimant_email || '')}</span></td><td><strong>${escapeHtml(String(x.verification_method || '').replaceAll('_',' '))}</strong><br>${escapeHtml(x.verification_evidence || '')}</td><td>${escapeHtml(String(x.requested_at || ''))}</td><td><form method="POST" action="/admin/profile-claims/${x.id}/approve" style="display:inline"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}"><button class="btn small" type="submit">Approve</button></form> <form method="POST" action="/admin/profile-claims/${x.id}/reject" style="display:inline"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}"><button class="btn ghost small" type="submit">Reject</button></form></td></tr>`).join('');
    send(ctx.res, layout({title:'Professional profile claims',currentUser:ctx.currentUser,session:ctx.session,body:`<section class="section container"><h1>Professional Claim Requests</h1><p class="muted">Review ownership evidence before giving a claimant control of an imported professional profile.</p>${rows ? `<div style="overflow-x:auto"><table><thead><tr><th>Profile</th><th>Claimant</th><th>Evidence</th><th>Requested</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="panel"><p class="muted" style="margin:0;">No professional claims are waiting for review.</p></div>'}</section>`}));
  });

  router.post('/admin/profile-claims/:id/approve', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) return redirect(ctx.res, '/admin/profile-claims');
    const claim = db.prepare("SELECT * FROM profile_claims WHERE id=? AND status='pending'").get(id);
    if (!claim) return redirect(ctx.res, '/admin/profile-claims');
    const existing = db.prepare('SELECT id FROM pro_profiles WHERE user_id=? AND id != ? LIMIT 1').get(claim.claimant_user_id, claim.pro_id);
    if (existing) return redirect(ctx.res, '/admin/profile-claims?error=' + encodeURIComponent('That account already owns another professional profile.'));

    try {
      db.exec('BEGIN');
      const attached = db.prepare("UPDATE pro_profiles SET user_id=?, claim_status='claimed' WHERE id=? AND user_id IS NULL AND claim_status IN ('unclaimed','claim_pending')").run(claim.claimant_user_id, claim.pro_id);
      if (!attached.changes) throw new Error('Profile is no longer available to claim.');
      db.prepare("UPDATE users SET role='pro' WHERE id=?").run(claim.claimant_user_id);
      db.prepare("UPDATE profile_claims SET status='approved', reviewed_at=CURRENT_TIMESTAMP, reviewer_user_id=? WHERE id=? AND status='pending'").run(ctx.currentUser.id, id);
      db.prepare("UPDATE profile_claims SET status='rejected', reviewed_at=CURRENT_TIMESTAMP, reviewer_user_id=? WHERE pro_id=? AND id != ? AND status='pending'").run(ctx.currentUser.id, claim.pro_id, id);
      db.prepare("INSERT INTO subscriptions (pro_id, status, trial_started_at, trial_ends_at) VALUES (?, 'trialing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days') ON CONFLICT (pro_id) DO NOTHING").run(claim.pro_id);
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      console.error('Professional claim approval failed', err);
      return redirect(ctx.res, '/admin/profile-claims?error=' + encodeURIComponent('Could not approve that claim. No ownership change was completed.'));
    }
    redirect(ctx.res, '/admin/profile-claims?success=' + encodeURIComponent('Professional claim approved. The 30-day trial has started.'));
  });

  router.post('/admin/profile-claims/:id/reject', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const id = Number(ctx.params.id);
    if (Number.isInteger(id) && id > 0) {
      const claim = db.prepare("SELECT pro_id FROM profile_claims WHERE id=? AND status='pending'").get(id);
      db.prepare("UPDATE profile_claims SET status='rejected', reviewed_at=CURRENT_TIMESTAMP, reviewer_user_id=? WHERE id=? AND status='pending'").run(ctx.currentUser.id, id);
      if (claim) {
        const remaining = db.prepare("SELECT id FROM profile_claims WHERE pro_id=? AND status='pending' LIMIT 1").get(claim.pro_id);
        if (!remaining) db.prepare("UPDATE pro_profiles SET claim_status='unclaimed' WHERE id=? AND user_id IS NULL AND claim_status='claim_pending'").run(claim.pro_id);
      }
    }
    redirect(ctx.res, '/admin/profile-claims');
  });

  router.get('/admin/outreach', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const allowed = new Set(['not_contacted','contacted','replied','claimed','do_not_contact']);
    const status = allowed.has(String(ctx.query.status || '')) ? String(ctx.query.status) : '';
    const q = String(ctx.query.q || '').trim().slice(0, 100);
    let sql = `SELECT id, name, city, state, contact_email, contact_email_source_url, contact_email_checked_at,
      outreach_status, outreach_last_contacted_at, outreach_notes, claim_status
      FROM shops WHERE 1=1`;
    const args = [];
    if (status) { sql += ' AND outreach_status = ?'; args.push(status); }
    if (q) { sql += ' AND (name LIKE ? OR city LIKE ? OR contact_email LIKE ?)'; const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%'; args.push(like, like, like); }
    sql += ' ORDER BY CASE outreach_status WHEN \'replied\' THEN 1 WHEN \'not_contacted\' THEN 2 WHEN \'contacted\' THEN 3 WHEN \'claimed\' THEN 4 ELSE 5 END, name ASC';
    let businesses = [];
    try { businesses = db.prepare(sql).all(...args); } catch (err) { console.error('Outreach list unavailable', err); }
    const counts = {};
    try { db.prepare('SELECT outreach_status, COUNT(*) AS total FROM shops GROUP BY outreach_status').all().forEach(x => { counts[x.outreach_status] = x.total; }); } catch {}
    const labels = {not_contacted:'Not contacted',contacted:'Contacted',replied:'Replied',claimed:'Claimed',do_not_contact:'Do not contact'};
    const tabs = ['',...allowed].map(s => `<a class="btn small ${status===s?'':'secondary'}" href="/admin/outreach${s?'?status='+s:''}">${s ? labels[s] + ' (' + (counts[s] || 0) + ')' : 'All (' + businesses.length + ')'}</a>`).join(' ');
    const rows = businesses.map(x => `<tr>
      <td><a href="/shop/${x.id}"><strong>${escapeHtml(x.name)}</strong></a><br><span class="muted">${escapeHtml(x.city || '')}, ${escapeHtml(x.state || '')}</span></td>
      <td>${x.contact_email ? '<a href="mailto:'+escapeHtml(x.contact_email)+'">'+escapeHtml(x.contact_email)+'</a>' : '<span class="muted">Not found</span>'}${x.contact_email_source_url ? '<br><a class="muted" target="_blank" rel="noopener noreferrer" href="'+escapeHtml(x.contact_email_source_url)+'">Source</a>' : ''}</td>
      <td><strong>${escapeHtml(labels[x.outreach_status] || x.outreach_status)}</strong>${x.outreach_last_contacted_at ? '<br><span class="muted">'+escapeHtml(String(x.outreach_last_contacted_at))+'</span>' : ''}</td>
      <td><form method="POST" action="/admin/outreach/${x.id}/status" style="display:flex;gap:6px;align-items:center"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}"><select name="status" style="min-width:140px">${Object.entries(labels).map(([v,l])=>'<option value="'+v+'"'+(x.outreach_status===v?' selected':'')+'>'+l+'</option>').join('')}</select><button class="btn small" type="submit">Save</button></form></td>
    </tr>`).join('');
    const body = `<section class="section container"><h1>Business Outreach</h1><p class="muted">Public business contact emails and GoBookr outreach progress.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin:18px 0">${tabs}</div><form method="GET" action="/admin/outreach" style="display:flex;gap:8px;max-width:520px;margin-bottom:18px"><input name="q" value="${escapeHtml(q)}" placeholder="Search business, city, or email"><button class="btn small">Search</button></form>${rows ? `<div style="overflow-x:auto"><table><thead><tr><th>Business</th><th>Email</th><th>Status</th><th>Update</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="panel"><p class="muted" style="margin:0;">No businesses match this filter.</p></div>'}</section>`;
    send(ctx.res, layout({title:'Business Outreach',currentUser:ctx.currentUser,session:ctx.session,body}));
  });

  router.post('/admin/outreach/:id/status', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const id = Number(ctx.params.id); const status = String(ctx.body.status || '');
    const allowed = new Set(['not_contacted','contacted','replied','claimed','do_not_contact']);
    if (Number.isInteger(id) && id > 0 && allowed.has(status)) {
      db.prepare(`UPDATE shops SET outreach_status=?, outreach_last_contacted_at=CASE WHEN ?='contacted' THEN CURRENT_TIMESTAMP ELSE outreach_last_contacted_at END, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status,status,id);
    }
    redirect(ctx.res,'/admin/outreach');
  });

};

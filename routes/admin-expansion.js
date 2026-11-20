'use strict';
// /admin/shop-expansion — national shop directory rollout, all 50 states.
// Live numbers (published, websites, claimed, cities) come straight from shops; discovery, review and
// coverage numbers come from the latest recorded run in shop_expansion_states. At most four queries.
const db = require('../db');
const { layout } = require('../lib/layout');
const { send } = require('../lib/http');
const { escapeHtml } = require('../lib/util');
const { requireAdmin } = require('../lib/admin');
const { STATES } = require('../lib/shop-states');
const { shopCategoryLabel } = require('../lib/shop-categories');

const STATUS_LABELS = { discovery: 'Discovery', importing: 'Importing', verification: 'Verification', live: 'Live', maintenance: 'Maintenance' };
const n = (v) => Number(v || 0).toLocaleString('en-US');
const date = (v) => (v ? escapeHtml(String(v).slice(0, 10)) : '—');

module.exports = function (router) {
  router.get('/admin/shop-expansion', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const focus = String(ctx.query?.state || '').toUpperCase();
    const focusState = STATES.find((s) => s.code === focus) || null;

    let recorded = [];
    try { recorded = db.prepare('SELECT * FROM shop_expansion_states').all(); } catch (_) { recorded = []; }
    const live = db.prepare(`SELECT UPPER(state) AS state, COUNT(*) AS published,
        COUNT(*) FILTER (WHERE website_url <> '') AS with_website,
        COUNT(*) FILTER (WHERE owner_user_id IS NOT NULL OR claim_status = 'claimed') AS claimed,
        COUNT(*) FILTER (WHERE operational_status = 'uncertain') AS uncertain,
        COUNT(DISTINCT lower(city)) AS cities
      FROM shops WHERE operational_status <> 'closed' GROUP BY UPPER(state)`).all();
    const byState = new Map(live.map((r) => [r.state, r]));
    const rec = new Map(recorded.map((r) => [r.state, r]));
    const categories = focusState
      ? db.prepare(`SELECT sc.category, COUNT(*) AS n FROM shop_categories sc JOIN shops s ON s.id = sc.shop_id
          WHERE UPPER(s.state) = ? AND s.operational_status <> 'closed' GROUP BY sc.category ORDER BY n DESC`).all(focus)
      : db.prepare(`SELECT sc.category, COUNT(*) AS n FROM shop_categories sc JOIN shops s ON s.id = sc.shop_id
          WHERE s.operational_status <> 'closed' GROUP BY sc.category ORDER BY n DESC`).all();
    const cities = focusState
      ? db.prepare(`SELECT city, COUNT(*) AS published, COUNT(*) FILTER (WHERE website_url <> '') AS with_website,
            COUNT(*) FILTER (WHERE owner_user_id IS NOT NULL OR claim_status = 'claimed') AS claimed
          FROM shops WHERE UPPER(state) = ? AND operational_status <> 'closed' GROUP BY city ORDER BY published DESC, city LIMIT 300`).all(focus)
      : [];

    const totals = { published: 0, with_website: 0, claimed: 0, cities: 0, candidates: 0, verified: 0, held: 0, skipped: 0, live: 0 };
    const rows = STATES.map((s) => {
      const l = byState.get(s.code) || {}; const r = rec.get(s.code) || {};
      totals.published += Number(l.published || 0); totals.with_website += Number(l.with_website || 0); totals.claimed += Number(l.claimed || 0);
      totals.cities += Number(l.cities || 0); totals.candidates += Number(r.candidates || 0); totals.verified += Number(r.verified_unique || 0);
      totals.held += Number(r.held_for_review || 0); totals.skipped += Number(r.duplicates_skipped || 0);
      if (['live', 'maintenance'].includes(r.status)) totals.live += 1;
      const status = r.status ? STATUS_LABELS[r.status] : 'Not started';
      const missing = Math.max(0, Number(l.published || 0) - Number(l.with_website || 0));
      const places = r.census_places ? `${n(r.places_covered)} / ${n(r.census_places)}` : '—';
      const counties = r.census_counties ? `${n(r.counties_covered)} / ${n(r.census_counties)}` : '—';
      return `<tr>
        <td><a href="/admin/shop-expansion?state=${s.code}">${escapeHtml(s.name)}</a></td><td>${s.wave}</td>
        <td><span class="badge${['live', 'maintenance'].includes(r.status) ? ' verified' : ''}">${escapeHtml(status)}</span></td>
        <td>${n(l.cities)}</td><td>${places}</td><td>${counties}</td>
        <td>${n(r.sources_processed)} / ${n(r.sources_discovered)}</td>
        <td>${n(r.candidates)}</td><td>${n(r.verified_unique)}</td><td>${n(l.published)}</td>
        <td>${n(l.with_website)}</td><td>${n(missing)}</td><td>${n(r.held_for_review)}</td><td>${n(l.claimed)}</td>
        <td>${date(r.last_discovery_run_at)}</td><td>${date(r.last_import_at)}</td>
        <td class="muted">${escapeHtml(String(r.importer_errors || '').slice(0, 160))}</td>
        <td class="muted">${escapeHtml(String(r.coverage_gaps || '').slice(0, 160))}</td>
      </tr>`;
    }).join('');

    const catRows = categories.map((c) => `<tr><td>${escapeHtml(shopCategoryLabel(c.category))}</td><td>${n(c.n)}</td></tr>`).join('');
    const f = focusState ? rec.get(focus) || {} : null;
    const reasons = f && f.review_reasons ? Object.entries(typeof f.review_reasons === 'string' ? JSON.parse(f.review_reasons) : f.review_reasons) : [];
    const sources = f && f.sources ? (typeof f.sources === 'string' ? JSON.parse(f.sources) : f.sources) : [];
    const focusBlock = focusState ? `
      <h2>${escapeHtml(focusState.name)}</h2>
      ${f.verification_notes ? `<p class="muted">${escapeHtml(f.verification_notes)}</p>` : ''}
      <div class="gb-expansion-split">
        <div><h3>Sources</h3>${sources.length ? `<table><thead><tr><th>Source</th><th>Status</th><th>Records</th></tr></thead><tbody>${sources.map((x) => `<tr><td>${escapeHtml(x.name || '')}</td><td>${escapeHtml(x.status || '')}</td><td>${n(x.records)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No discovery run recorded yet.</p>'}
          <h3>Held for review</h3>${reasons.length ? `<table><tbody>${reasons.sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${escapeHtml(k.replace(/_/g, ' '))}</td><td>${n(v)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">None recorded.</p>'}
          <h3>Categories</h3>${catRows ? `<table><tbody>${catRows}</tbody></table>` : '<p class="muted">No published shops yet.</p>'}</div>
        <div><h3>Cities with published shops</h3>${cities.length ? `<table><thead><tr><th>City</th><th>Published</th><th>Websites</th><th>Claimed</th></tr></thead><tbody>${cities.map((c) => `<tr><td>${escapeHtml(c.city || '(no city)')}</td><td>${n(c.published)}</td><td>${n(c.with_website)}</td><td>${n(c.claimed)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No published shops yet.</p>'}</div>
      </div>` : `<h2>Categories nationwide</h2>${catRows ? `<table><tbody>${catRows}</tbody></table>` : ''}`;

    const body = `<section class="section container gb-expansion">
      <h1>National shop expansion</h1>
      <p class="muted">Published, website and claimed counts are live from GoBookr. Discovery, review and coverage numbers come from each state's latest recorded run. Coverage counts Census places and counties with at least one published shop.</p>
      <dl class="gb-expansion-totals">
        <div><dt>Published shops</dt><dd>${n(totals.published)}</dd></div>
        <div><dt>With websites</dt><dd>${n(totals.with_website)}</dd></div>
        <div><dt>Claimed</dt><dd>${n(totals.claimed)}</dd></div>
        <div><dt>States live</dt><dd>${totals.live} of 50</dd></div>
        <div><dt>Held for review</dt><dd>${n(totals.held)}</dd></div>
        <div><dt>Progress to 100,000</dt><dd>${(totals.published / 1000).toFixed(1)}%</dd></div>
      </dl>
      ${focusState ? '<p><a href="/admin/shop-expansion">All states</a></p>' : ''}
      ${focusBlock}
      <h2>States</h2>
      <div class="gb-expansion-scroll"><table>
        <thead><tr><th>State</th><th>Wave</th><th>Status</th><th>Cities with shops</th><th>Census places covered</th><th>Counties covered</th><th>Sources processed</th><th>Candidates</th><th>Verified unique</th><th>Published</th><th>With website</th><th>Missing website</th><th>Needs verification</th><th>Claimed</th><th>Last discovery</th><th>Last import</th><th>Importer errors</th><th>Coverage gaps</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`;
    send(ctx.res, layout({ title: 'National shop expansion', currentUser: ctx.currentUser, session: ctx.session, body }));
  });
};

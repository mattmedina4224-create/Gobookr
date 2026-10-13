'use strict';
const db = require('../db');
const { layout } = require('../lib/layout');
const { send, redirect, flashFromQuery } = require('../lib/http');
const { escapeHtml } = require('../lib/util');
const { PROFESSIONAL_CATEGORIES } = require('../lib/pro-categories');
const { catalog, get } = require('../public/specialty-catalog');
const { matches } = require('../lib/specialty-search');
const { finderForm } = require('../lib/specialty-finder-view');
function owner(ctx) {
  if (!ctx.currentUser) { redirect(ctx.res,'/login?next=%2Fdashboard%2Fpro%2Fspecialties'); return null; }
  if (ctx.currentUser.role !== 'pro') { send(ctx.res,'Professional account required.',403); return null; }
  const profile = db.prepare('SELECT id FROM pro_profiles WHERE user_id=?').get(ctx.currentUser.id);
  if (!profile) send(ctx.res,'Professional profile not found.',404);
  return profile;
}
module.exports = router => {
  router.get('/finder', async ctx => send(ctx.res,layout({title:'Find your person',currentUser:ctx.currentUser,session:ctx.session,body:finderForm()})));
  router.get('/finder/matches', async ctx => {
    ctx.res.setHeader('Cache-Control','no-store');
    const specialty = typeof ctx.query.specialty === 'string' ? ctx.query.specialty : '';
    const city = typeof ctx.query.city === 'string' ? ctx.query.city.trim() : '';
    if (!get(specialty) || !city || city.length > 100 || /[<>\x00-\x1f]/.test(city)) {
      ctx.res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'}); ctx.res.end(JSON.stringify({error:'Choose a specialty and enter a city or ZIP code.'})); return;
    }
    const results = matches(specialty,city).map(pro => {
      const raw = pro.coverPhoto?.image_url || pro.profile_photo_url || '';
      let photo = ''; try { const url = new URL(raw); if (url.protocol === 'https:' && !url.username && !url.password) photo = url.href; } catch (_) {}
      return {id:Number(pro.id),name:pro.business_name,city:pro.city,state:pro.state,photo,rating:pro.rating,reviewCount:pro.reviewCount};
    });
    ctx.res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'}); ctx.res.end(JSON.stringify({specialty:get(specialty).label,results}));
  });
  router.get('/dashboard/pro/specialties', async ctx => {
    const profile = owner(ctx); if (!profile) return;
    const categories = db.prepare('SELECT category FROM pro_categories WHERE pro_id=?').all(profile.id).map(row=>row.category);
    const selected = new Set(db.prepare('SELECT specialty FROM pro_specialties WHERE pro_id=?').all(profile.id).map(row=>row.specialty));
    const groups = PROFESSIONAL_CATEGORIES.filter(category=>categories.includes(category.value)).map(category=> {
      const options = catalog.filter(item=>item.categories.includes(category.value));
      if (!options.length) return '';
      return `<fieldset class="specialty-group"><legend>${escapeHtml(category.label)}</legend>${options.map(item=>`<label><input type="checkbox" name="specialty_${item.id}" value="1"${selected.has(item.id)?' checked':''} /> ${escapeHtml(item.label)}</label>`).join('')}</fieldset>`;
    }).join('');
    const body = `<link rel="stylesheet" href="/specialty-finder.css" /><section class="section container narrow"><a href="/dashboard/pro/profile">← Profile &amp; services</a><h1>Your specialties</h1><p>Help customers find the specific work you do. Choose only specialties you actually offer. These are listed by you, not independently verified.</p><form method="POST" action="/dashboard/pro/specialties"><input type="hidden" name="_csrf" value="${escapeHtml(ctx.session.csrf_token)}" />${groups || '<p>Add your service categories on your profile first.</p>'}<button class="btn" type="submit">Save specialties</button></form><p class="helptext">Missing your specialty? You can still list it as a service on your profile. More specialty options will be added as the directory grows.</p></section>`;
    send(ctx.res,layout({title:'Your specialties',currentUser:ctx.currentUser,session:ctx.session,flash:flashFromQuery(ctx.query),body}));
  });
  router.post('/dashboard/pro/specialties', async ctx => {
    const profile = owner(ctx); if (!profile) return;
    const categories = db.prepare('SELECT category FROM pro_categories WHERE pro_id=?').all(profile.id).map(row=>row.category);
    const keys = Object.keys(ctx.body).filter(key=>key.startsWith('specialty_'));
    if (keys.some(key=>!get(key.slice(10)) || ctx.body[key] !== '1' || !get(key.slice(10)).categories.some(category=>categories.includes(category)))) {
      send(ctx.res,'Choose specialties from your existing service categories.',400); return;
    }
    const selected = [...new Set(keys.map(key=>key.slice(10)))];
    // One write keeps the selection atomic; no deletion can happen without the replacement.
    const json = JSON.stringify(selected);
    db.prepare(`WITH removed AS (DELETE FROM pro_specialties WHERE pro_id=? AND specialty NOT IN (SELECT value FROM jsonb_array_elements_text(?::jsonb)) RETURNING pro_id)
      INSERT INTO pro_specialties(pro_id,specialty)
      SELECT ?, value FROM jsonb_array_elements_text(?::jsonb) ON CONFLICT DO NOTHING`).run(profile.id,json,profile.id,json);
    redirect(ctx.res,'/dashboard/pro/specialties?success=Specialties+saved');
  });
};

'use strict';
const { aliasGroups } = require('./service-catalog');
const STOP = new Set(['and','a','an','the','for','in','near','me','looking','specialist','specializing','specialize']);
function normalize(text) {
  return String(text || '').toLowerCase().replace(/grey/g,'gray').replace(/colour/g,'color').replace(/[-–—&]/g,' ').replace(/\s+/g,' ').trim();
}
function terms(text) { return normalize(text).split(' ').filter(t=>t && !STOP.has(t)).map(t=>t.length>4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0,-1):t).slice(0,8); }
function variants(query) {
  const clean = normalize(String(query || '').slice(0,100).replace(/^@+/,''));
  const key = terms(clean).join(' ');
  const group = aliasGroups.find(g => g.some(alias => terms(alias).join(' ') === key));
  const seen=new Set();
  return [clean,...(group || []).map(normalize)].filter(v=>{
    const key=terms(v).join(' ') || v;
    if (!v || seen.has(key)) return false;
    seen.add(key);return true;
  }).slice(0,6);
}
function escapeLike(s) { return '%' + s.replace(/[\\%_]/g,c=>'\\'+c) + '%'; }
function normalizedSql(column) {
  return `REPLACE(REPLACE(REPLACE(REPLACE(LOWER(COALESCE(${column}, '')), 'grey', 'gray'), 'colour', 'color'), '-', ' '), '&', ' ')`;
}
function predicate(column, queryVariants) {
  const args=[];
  const sql=queryVariants.map(v=>{
    const words=terms(v);
    return '('+(words.length?words:[v]).map(word=>{
      args.push(escapeLike(word));
      return `${normalizedSql(column)} LIKE ? ESCAPE '\\'`;
    }).join(' AND ')+')';
  }).join(' OR ');
  return {sql:sql?'('+sql+')':'0=1',args};
}
function buildSearch(query) {
  const vs=variants(query);
  const conditions=[
    { ...predicate('pro_profiles.business_name',vs), weight:60 },
    { ...predicate('pro_profiles.professional_handle',vs), weight:60 },
    { ...predicate('pro_profiles.workplace_name',vs), weight:45 },
    { ...predicate('pro_profiles.bio',vs), weight:85 },
  ];
  const service=predicate('qs.name',vs);
  const category=predicate("REPLACE(qc.category, '_', ' ')",vs);
  conditions.push({sql:`EXISTS (SELECT 1 FROM services qs WHERE qs.pro_id = pro_profiles.id AND ${service.sql})`,args:service.args,weight:120});
  conditions.push({sql:`EXISTS (SELECT 1 FROM pro_categories qc WHERE qc.pro_id = pro_profiles.id AND ${category.sql})`,args:category.args,weight:25});
  const relevance=conditions.map(c=>`CASE WHEN ${c.sql} THEN ${c.weight} ELSE 0 END`).join(' + ');
  // Fractional quality bonuses only break equal/near-equal relevance ties; they can never
  // make a generic profile outrank a materially stronger specialty/service match.
  const quality=[
    `CASE WHEN COALESCE(pro_profiles.license_verified, FALSE) THEN 0.18 ELSE 0 END`,
    `CASE WHEN COALESCE(pro_profiles.profile_photo_url, '') <> '' THEN 0.08 ELSE 0 END`,
    `CASE WHEN LENGTH(TRIM(COALESCE(pro_profiles.bio, ''))) >= 80 THEN 0.08 ELSE 0 END`,
    `CASE WHEN EXISTS (SELECT 1 FROM services quality_service WHERE quality_service.pro_id = pro_profiles.id) THEN 0.10 ELSE 0 END`,
    `CASE WHEN COALESCE(pro_profiles.booking_url, '') <> '' THEN 0.07 ELSE 0 END`,
  ].join(' + ');
  return {
    where:'('+conditions.map(c=>c.sql).join(' OR ')+')',
    args:conditions.flatMap(c=>c.args),
    order:`(${relevance}) + (${quality})`,
    orderArgs:conditions.flatMap(c=>c.args),
    variants:vs,
  };
}
function profileQualityScore(pro) {
  if (!pro) return 0;
  let score=0;
  if (pro.license_verified) score+=18;
  if (pro.profile_photo_url || pro.coverPhoto || pro.image_url) score+=8;
  if (String(pro.bio || '').trim().length >= 80) score+=8;
  if (Array.isArray(pro.services) && pro.services.length) score+=10;
  if (pro.booking_url) score+=7;
  if (Number(pro.reviewCount) > 0) score+=Math.min(12, Number(pro.reviewCount));
  if (Number(pro.rating) >= 4.5) score+=7;
  return score;
}
function compareResults(a,b) {
  const relevance=Number(b.search_score || 0)-Number(a.search_score || 0);
  if (relevance) return relevance;
  const quality=profileQualityScore(b)-profileQualityScore(a);
  if (quality) return quality;
  const distance=(a.distanceMiles ?? Infinity)-(b.distanceMiles ?? Infinity);
  if (distance) return distance;
  return Number(b.id || 0)-Number(a.id || 0);
}
function matches(text, query) {
  const hay=normalize(text);
  return variants(query).some(v=>{const words=terms(v);return (words.length?words:[v]).every(w=>hay.includes(w));});
}
function explain(pro,query) {
  if (!query) return '';
  if (pro.matched_service) return 'Service: ' + pro.matched_service;
  const service=(pro.services || []).find(s=>matches(s.name,query));
  if (service) return 'Service: ' + service.name;
  if (matches(pro.bio,query)) {
    const raw=String(pro.bio || '');
    const at=Math.max(0, ...terms(query).map(t=>normalize(raw).indexOf(t)).filter(i=>i>=0).map(i=>i-35));
    return 'About Me: “' + (at ? '…' : '') + raw.slice(at,at+140) + (raw.length>at+140?'…':'') + '”';
  }
  if (matches(pro.business_name,query) || matches(pro.professional_handle,query)) return 'Matches professional name or handle';
  if (matches(pro.workplace_name,query)) return 'Matches workplace name';
  if ((pro.categories || []).some(c=>matches(c.replace(/_/g,' '),query))) return 'Matches professional category';
  return '';
}
module.exports={normalize,variants,buildSearch,matches,explain,predicate,profileQualityScore,compareResults};

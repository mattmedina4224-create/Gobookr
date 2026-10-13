'use strict';
const db = require('../db');
const { hydratePros } = require('./pro-listing-data');
const catalog = require('../public/specialty-catalog');
const businessTeam = require('./business-team');

// Keep eligibility in SQL before the limit, then use the shared hydration gate.
function publicSearchSql() {
  let sql = "SELECT pro_profiles.* FROM pro_profiles LEFT JOIN subscriptions search_sub ON search_sub.pro_id=pro_profiles.id WHERE ((pro_profiles.user_id IS NULL AND pro_profiles.claim_status IN ('unclaimed','claim_pending') AND COALESCE(pro_profiles.business_name,'') <> '' AND COALESCE(pro_profiles.city,'') <> '' AND COALESCE(pro_profiles.state,'') <> '' AND COALESCE(pro_profiles.source_url,'') <> '' AND COALESCE(pro_profiles.source_name,'') <> '') OR (pro_profiles.user_id IS NOT NULL AND pro_profiles.onboarding_completed=1 AND (search_sub.status='active' OR (search_sub.status='trialing' AND search_sub.trial_ends_at > CURRENT_TIMESTAMP) OR (search_sub.status IN ('past_due','unpaid') AND search_sub.past_due_since IS NOT NULL AND search_sub.past_due_since > CURRENT_TIMESTAMP - INTERVAL '7 days'))))";
  if (businessTeam.enabled()) sql = sql.replace("search_sub.status='active'",`EXISTS(SELECT 1 FROM (${businessTeam.coverageSql}) sponsored WHERE sponsored.pro_id=pro_profiles.id) OR search_sub.status='active'`);
  return sql;
}
function specialtyClause(id, args) {
  args.push(id);
  return ' AND EXISTS (SELECT 1 FROM pro_specialties ps WHERE ps.pro_id=pro_profiles.id AND ps.specialty=?)';
}
function matches(id, city) {
  if (!catalog.get(id)) return [];
  const args = []; let sql = publicSearchSql() + specialtyClause(id,args);
  if (city) { sql += ' AND (LOWER(city)=LOWER(?) OR zip_code=?)'; args.push(city,city); }
  return hydratePros(db.prepare(sql + ' ORDER BY pro_profiles.id DESC LIMIT 6').all(...args),{includeServices:false});
}
module.exports = { publicSearchSql, specialtyClause, matches };

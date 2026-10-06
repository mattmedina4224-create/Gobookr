'use strict';

const { createHash } = require('node:crypto');
const MODULES = Object.freeze(['support','onboarding','data_quality','trust_safety','licenses','marketing','seo','billing','briefing','engineering']);
const FIELDS = Object.freeze(['description','categories','booking_link','address','photo']);
const CODES = Object.freeze(['missing_field','booking_unavailable','booking_unverified','stale_source']);
function integer(n, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(n) && n >= 0 && n <= max;
}
function validateInput(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype) throw new Error('Invalid input');
  const keys = ['profile_id','missing_fields','booking_status','source_age_days'];
  if (Object.keys(input).some(k => !keys.includes(k))) throw new Error('Unapproved input field');
  if (!integer(input.profile_id) || input.profile_id === 0 || !Array.isArray(input.missing_fields)
    || input.missing_fields.length > FIELDS.length || input.missing_fields.some(x => !FIELDS.includes(x))
    || !['working','missing','unverified','failed'].includes(input.booking_status)
    || !integer(input.source_age_days, 36500)) throw new Error('Invalid profile snapshot');
  return { profile_id:input.profile_id, missing_fields:[...new Set(input.missing_fields)].sort(), booking_status:input.booking_status, source_age_days:input.source_age_days };
}
function hashInput(input) {
  return createHash('sha256').update(JSON.stringify(validateInput(input))).digest('hex');
}
function evaluateProfile(input) {
  const p = validateInput(input), findings = [];
  for (const field of p.missing_fields) findings.push({code:'missing_field',field,confidence:1});
  if (['missing','failed'].includes(p.booking_status)) findings.push({code:'booking_unavailable',field:'booking_link',confidence:1});
  if (p.booking_status === 'unverified') findings.push({code:'booking_unverified',field:'booking_link',confidence:1});
  if (p.source_age_days > 90) findings.push({code:'stale_source',field:null,confidence:1});
  // Confidence is certainty about the supplied observation, never permission to change a profile.
  return findings;
}
function validateFindings(findings) {
  if (!Array.isArray(findings) || findings.length > 8) throw new Error('Invalid findings');
  return findings.map(f => {
    if (!f || Object.keys(f).some(k => !['code','field','confidence'].includes(k))
      || !CODES.includes(f.code) || !(f.field === null || FIELDS.includes(f.field))
      || typeof f.confidence !== 'number' || !Number.isFinite(f.confidence) || f.confidence < 0 || f.confidence > 1) throw new Error('Invalid finding');
    return {code:f.code,field:f.field,confidence:f.confidence};
  });
}
function authorizeJob(kind) {
  if (kind !== 'data_quality.snapshot.v1') throw new Error('Job is disabled or unknown');
  return { module:'data_quality', version:1, permissions:['read_sanitized_snapshot','record_findings'], external_calls:false };
}
function estimateMicrousd({inputTokens,outputTokens,inputUsdPerMillion,outputUsdPerMillion}) {
  if (![inputTokens,outputTokens].every(n => integer(n, 10000000))
    || ![inputUsdPerMillion,outputUsdPerMillion].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000)) throw new Error('Invalid usage or rate');
  return Math.ceil(inputTokens * inputUsdPerMillion + outputTokens * outputUsdPerMillion);
}
// Interface for future providers: generate({sanitizedInput, maxOutputTokens, signal})
// -> {result, inputTokens, outputTokens, provider, model, requestId}.
// Only this deterministic adapter is enabled in Phase 1; it cannot perform network I/O.
const rulesAdapter = Object.freeze({
  provider:'rules', model:'profile-snapshot-v1',
  async generate(input) { return {findings:evaluateProfile(input),inputTokens:0,outputTokens:0,costMicrousd:0}; }
});
module.exports = { MODULES, FIELDS, validateInput, hashInput, evaluateProfile, validateFindings, authorizeJob, estimateMicrousd, rulesAdapter };

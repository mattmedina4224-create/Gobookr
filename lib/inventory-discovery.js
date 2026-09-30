'use strict';

// GoBookr discovery candidate ingestion.
// Source adapters produce factual public listing candidates; this module validates and
// queues them for review/import. It never creates users and never invents contact data.

const db = require('../db');
const { PROFESSIONAL_CATEGORY_VALUES: SUPPORTED } = require('./pro-categories');
const APPROVED_HOSTS = ['booksy.com','glossgenius.com','square.site','squareup.com','vagaro.com','joinblvd.com','boulevard.io','mangomint.com','zenoti.com','booker.com','squire.com','getsquire.com'];
const clean = v => String(v || '').trim();

function approvedUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./,'');
    return APPROVED_HOSTS.some(x => host === x || host.endsWith('.'+x));
  } catch { return false; }
}

function queueCandidate(runId, raw) {
  const row = {
    name: clean(raw.name || raw.business_name),
    category: clean(raw.category).toLowerCase(),
    workplace: clean(raw.workplace_name),
    city: clean(raw.city),
    state: clean(raw.state).toUpperCase(),
    address: clean(raw.street_address || raw.address),
    zip: clean(raw.zip_code || raw.zip),
    booking: clean(raw.booking_url),
    source: clean(raw.source_url),
    sourceName: clean(raw.source_name),
    email: clean(raw.contact_email),
    phone: clean(raw.contact_phone),
    emailSource: clean(raw.contact_email_source_url),
    phoneSource: clean(raw.contact_phone_source_url),
  };
  if (!row.name || !row.city || !row.state || !row.source || !row.sourceName) return {status:'rejected',reason:'missing_required_fields'};
  if (!SUPPORTED.has(row.category)) return {status:'rejected',reason:'unsupported_category'};
  if (!approvedUrl(row.source)) return {status:'rejected',reason:'unapproved_source'};
  if (row.email && (!row.emailSource || !approvedUrl(row.emailSource))) return {status:'rejected',reason:'email_missing_approved_public_source'};
  if (row.phone && (!row.phoneSource || !approvedUrl(row.phoneSource))) return {status:'rejected',reason:'phone_missing_approved_public_source'};

  const existing = db.prepare(`SELECT id FROM pro_profiles WHERE LOWER(business_name)=LOWER(?) AND LOWER(city)=LOWER(?) AND UPPER(state)=UPPER(?) LIMIT 1`).get(row.name,row.city,row.state);
  if (existing) return {status:'duplicate',pro_id:existing.id};

  const prior = db.prepare(`SELECT id,status FROM inventory_discovery_candidates WHERE LOWER(source_url)=LOWER(?) AND LOWER(name)=LOWER(?) LIMIT 1`).get(row.source,row.name);
  if (prior) return {status:'duplicate',candidate_id:prior.id};

  const result=db.prepare(`INSERT INTO inventory_discovery_candidates
    (run_id,name,category,workplace_name,city,state,street_address,zip_code,booking_url,source_url,source_name,
     contact_email,contact_phone,contact_email_source_url,contact_phone_source_url,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`)
    .run(runId,row.name,row.category,row.workplace,row.city,row.state,row.address,row.zip,row.booking,row.source,row.sourceName,row.email,row.phone,row.emailSource,row.phoneSource);
  return {status:'pending',candidate_id:Number(result.lastInsertRowid)};
}

module.exports={queueCandidate,APPROVED_HOSTS,SUPPORTED};

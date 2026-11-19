'use strict';

// SQUIRE national pipeline: validate first-party SQUIRE barber page extracts and build import batches.
//
// Discovery and page reads happen through publicly indexed first-party SQUIRE pages (search-engine
// results and the page text those results point to). This script never fetches SQUIRE itself and never
// bypasses access controls. It applies GoBookr's import rules to the extracted page facts:
//
//   node scripts/squire-national-pipeline.js data/source-audits/squire-wave2/pages.json --batch=wave2-b01 [--exclude=existing.json]
//
// Input: [{ url, short_name, shop_name, address_line, footer_name, services: [..], status, checked_at, metro }]
//   - footer_name is the full display name SQUIRE prints just before its page footer.
//   - status is 'live' when the page rendered the barber profile, otherwise the error text seen.
// Output (in the same folder):
//   {batch}-import.json   rows in scripts/import-unclaimed-profiles.js input format
//   {batch}-rejected.json every rejected page with a reason
//   {batch}-insert.sql    the importer's INSERTs for production, guarded against duplicates in SQL
//
// Rules (data/source-audits/squire-national-readme.md + AGENTS.md):
//   - Never infer a surname from initials or a URL slug. The full name must be printed on the page.
//   - The printed name must agree with the barber slug (guards against mis-read pages).
//   - Reject first-name-only names, "Name at Shop" titles, initials, dead/410 pages.
//   - Require a full street address with city, two-letter state and 5-digit ZIP.
//   - Booking URL is the exact individual SQUIRE barber page. user_id stays NULL, claim_status unclaimed.

const fs = require('node:fs');
const path = require('node:path');
const { clean, identity, normalizeZip } = require('../lib/import-normalization');
const { isApprovedBookingSource } = require('../lib/booking-platforms');

const BARBER_URL = /^https:\/\/getsquire\.com\/discover\/barbershop\/([a-z0-9-]+)\/barber\/([a-z0-9-]+)$/;
const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));

const fold = (value) => clean(value).normalize('NFKD').replace(/[̀-ͯ]/g, '');
const titleCity = (value) => fold(value).toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

function canonicalUrl(url) {
  try {
    const u = new URL(clean(url));
    // SQUIRE serves the same barber at /booking/book/{shop}/barber/{slug}/services and /discover/barbershop/{shop}/barber/{slug}.
    const pathname = u.pathname.replace(/\/+$/, '').toLowerCase()
      .replace(/^\/booking\/book\/([a-z0-9-]+)\/barber\/([a-z0-9-]+)(?:\/services)?$/, '/discover/barbershop/$1/barber/$2');
    return `https://getsquire.com${pathname}`;
  } catch (_) { return ''; }
}

// "1000 Northside Drive NW, Atlanta, GA, 30318" -> { street, city, state, zip }
function parseAddress(line) {
  const parts = clean(line).split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) return null;
  const zip = normalizeZip(parts[parts.length - 1]);
  const state = parts[parts.length - 2].toUpperCase();
  const city = parts[parts.length - 3];
  const street = parts.slice(0, parts.length - 3).join(', ');
  if (!/^\d{5}$/.test(zip) || !US_STATES.has(state) || !city || !/\d/.test(street)) return null;
  // Malformed lines repeat the city/state/ZIP inside the street part; reject rather than guess the street.
  if (/united states|\b\d{5}\b/i.test(street.replace(/^\d+/, '')) || new RegExp(`\\b${state}\\b`).test(street)) return null;
  return { street, city: titleCity(city), state, zip };
}

// SQUIRE titles pages "{Name} at {Shop}". Strip the suffix only when it is exactly this page's shop name.
function printedName(footer, shopName) {
  const n = clean(footer).replace(/\s+/g, ' ');
  const shop = identity(fold(shopName));
  const m = n.match(/^(.+?)\s+at\s+(.+)$/i);
  if (m && shop && identity(fold(m[2])) === shop) return m[1].trim();
  return n;
}

function nameProblem(name, barberSlug) {
  const n = clean(name);
  if (!n) return 'no_full_name_on_page';
  if (/\s+at\s+/i.test(n)) return 'unparsed_at_title';
  if (/[()@#*]|\d/.test(n) || /\baka\b/i.test(n)) return 'nonstandard_display_name';
  const tokens = n.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return 'first_name_only';
  const last = tokens[tokens.length - 1].replace(/\.$/, '');
  if (last.length <= 1) return 'surname_initial_only';
  const firstToken = identity(fold(tokens[0])).replace(/\s+/g, '');
  const slug = barberSlug.replace(/-\d+$/, '');
  if (!firstToken || !slug.split('-').some((part) => part === firstToken || part.startsWith(firstToken) || firstToken.startsWith(part))) {
    return 'printed_name_does_not_match_page_slug';
  }
  return '';
}

function validate(page) {
  const url = canonicalUrl(page.url);
  const m = url.match(BARBER_URL);
  if (!m) return { reason: 'not_individual_squire_barber_page' };
  if (!isApprovedBookingSource(url)) return { reason: 'unapproved_source_host' };
  if (clean(page.status).toLowerCase() !== 'live') return { reason: 'page_not_live' };
  const fullName = printedName(page.footer_name, page.shop_name);
  const problem = nameProblem(fullName, m[2]);
  if (problem) return { reason: problem };
  const addr = parseAddress(page.address_line);
  if (!addr) return { reason: 'incomplete_address' };
  if (!clean(page.shop_name)) return { reason: 'missing_shop_name' };
  if (!Array.isArray(page.services) || !page.services.length) return { reason: 'no_services_listed' };
  return {
    row: {
      name: fullName,
      category: 'barber',
      workplace_name: clean(page.shop_name).replace(/\*+$/, '').trim(),
      city: addr.city,
      state: addr.state,
      street_address: addr.street,
      zip_code: addr.zip,
      booking_url: url,
      source_url: url,
      source_name: 'SQUIRE',
      source_checked_at: clean(page.checked_at),
      metro: clean(page.metro),
    },
  };
}

const sqlText = (v) => `'${String(v).replace(/'/g, "''")}'`;
const initials = (name) => clean(name).split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || 'GB';

// Mirrors scripts/import-unclaimed-profiles.js inserts. Duplicate guards run inside the database:
// skip when the exact booking URL already exists, or the same normalized name + city + state exists.
function insertSql(rows) {
  if (!rows.length) return '-- nothing to insert\n';
  const values = rows.map((r) => `(${[r.name, r.city, r.state, r.workplace_name, r.street_address, r.zip_code, r.booking_url, initials(r.name), r.source_url].map(sqlText).join(', ')})`).join(',\n  ');
  return `WITH incoming (business_name, city, state, workplace_name, street_address, zip_code, booking_url, initials, source_url) AS (VALUES
  ${values}
), fresh AS (
  SELECT i.* FROM incoming i
  WHERE NOT EXISTS (SELECT 1 FROM pro_profiles p WHERE lower(p.booking_url) = lower(i.booking_url))
    AND NOT EXISTS (SELECT 1 FROM pro_profiles p
      WHERE upper(p.state) = upper(i.state)
        AND regexp_replace(lower(p.city), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(i.city), '[^a-z0-9]+', '', 'g')
        AND regexp_replace(lower(p.business_name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(i.business_name), '[^a-z0-9]+', '', 'g'))
), inserted AS (
  INSERT INTO pro_profiles (user_id, business_name, category, bio, city, state, workplace_name, street_address, zip_code,
    booking_url, initials, claim_status, source_url, source_name, source_checked_at)
  SELECT NULL, business_name, 'barber', '', city, state, workplace_name, street_address, zip_code,
    booking_url, initials, 'unclaimed', source_url, 'SQUIRE', CURRENT_TIMESTAMP FROM fresh
  RETURNING id, business_name, city, state, booking_url
), cats AS (
  INSERT INTO pro_categories (pro_id, category) SELECT id, 'barber' FROM inserted RETURNING pro_id
)
SELECT (SELECT count(*) FROM incoming) AS submitted, (SELECT count(*) FROM inserted) AS inserted,
  (SELECT count(*) FROM cats) AS categories, (SELECT json_agg(inserted ORDER BY id) FROM inserted) AS rows;
`;
}

function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith('--'));
  if (!input) throw new Error('Pass the extracted pages JSON file.');
  const batch = (args.find((a) => a.startsWith('--batch=')) || '--batch=batch').split('=')[1];
  const excludeArg = args.find((a) => a.startsWith('--exclude='));
  const exclude = new Set(excludeArg ? JSON.parse(fs.readFileSync(excludeArg.split('=')[1], 'utf8')).map(canonicalUrl) : []);
  const pages = JSON.parse(fs.readFileSync(input, 'utf8'));
  const dir = path.dirname(path.resolve(input));
  const accepted = []; const rejected = []; const seen = new Set(); const seenIdentity = new Set();
  for (const page of pages) {
    const url = canonicalUrl(page.url);
    if (exclude.has(url)) { rejected.push({ url, reason: 'already_in_gobookr_booking_url' }); continue; }
    if (seen.has(url)) { rejected.push({ url, reason: 'duplicate_url_in_batch' }); continue; }
    seen.add(url);
    const { row, reason } = validate(page);
    if (!row) { rejected.push({ url, name_seen: clean(page.footer_name || page.short_name), reason }); continue; }
    const key = [row.name, row.city, row.state].map(identity).join('|');
    if (seenIdentity.has(key)) { rejected.push({ url, name_seen: row.name, reason: 'duplicate_identity_in_batch' }); continue; }
    seenIdentity.add(key);
    accepted.push(row);
  }
  fs.writeFileSync(path.join(dir, `${batch}-import.json`), JSON.stringify(accepted, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, `${batch}-rejected.json`), JSON.stringify(rejected, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, `${batch}-insert.sql`), insertSql(accepted));
  const reasons = rejected.reduce((acc, r) => { acc[r.reason] = (acc[r.reason] || 0) + 1; return acc; }, {});
  console.log(JSON.stringify({ batch, pages: pages.length, accepted: accepted.length, rejected: rejected.length, reasons }, null, 1));
}

if (require.main === module) main();
module.exports = { validate, parseAddress, nameProblem, printedName, canonicalUrl, insertSql };

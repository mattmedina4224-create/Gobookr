'use strict';

// Non-mutating, first-party source audit for the MODERN SalonStudios.
// Usage: node scripts/audit-modern-salonstudios.js [--output=tmp/modern-audit.json]
// Run periodically to discover new professionals; never import unverified links automatically.
const fs = require('node:fs');
const path = require('node:path');

const DIRECTORY = 'https://modernsalonstudios.com/beautypros/';
const SITE = 'https://modernsalonstudios.com';
const bookingHosts = [
  'glossgenius.com', 'square.site', 'squareup.com', 'vagaro.com',
  'booksy.com', 'ginasplatform.com', 'styleseat.com',
  'as.me', 'acuityscheduling.com', 'book.heygoldie.com',
  'getsquire.com', 'squire.com', 'thecut.co', 'janeapp.com',
  'joinmoxie.com',
];

const categoryMap = {
  hair: 'stylist', color: 'colorist', extensions: 'stylist',
  nails: 'nail_technician', lashes: 'eyelash_technician',
  brows: 'eyebrow_technician', skin: 'esthetician',
  massage: 'massage_therapist', tattooing: 'tattoo_artist',
  'waxing-beautypros': 'waxing_specialist',
};

function decodeText(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ')
    .replace(/&#8211;|&ndash;/g, '–').replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function isBookingHost(raw) {
  try {
    const url = new URL(String(raw || ''));
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return bookingHosts.some((entry) => host === entry || host.endsWith('.' + entry));
  } catch (_) {
    return false;
  }
}

function parseDirectory(html) {
  const text = String(html || '');
  const results = [];
  const seen = new Set();
  const block = /<div id="post-(\d+)" class="([^"]*\bet_pb_portfolio_item\b[^"]*)">/gi;
  let match;
  while ((match = block.exec(text))) {
    const tail = text.slice(match.index, match.index + 1900);
    const href = /<a href="(https:\/\/modernsalonstudios\.com\/project\/[^"]+)"/i.exec(tail);
    if (!href || seen.has(href[1])) continue;
    seen.add(href[1]);
    const heading = /<h2 class="et_pb_module_header"><a[^>]*>([\s\S]*?)<\/a>/i.exec(tail);
    const tags = [...new Set((match[2].match(/project_category_[a-z-]+/g) || [])
      .map((item) => item.replace('project_category_', '')))];
    results.push({
      post_id: match[1],
      profile_url: href[1],
      heading: heading ? decodeText(heading[1]) : '',
      source_tags: tags,
    });
  }
  return results;
}

function parseProfile(card, html) {
  const text = String(html || '').replace(/&#8211;|&ndash;/g, '–');
  const h4 = /<h4\b[^>]*>([\s\S]*?)<\/h4>/i.exec(text);
  const name = h4 ? decodeText(h4[1]) : '';
  const location = /(Indian Tree|DTC)\s+Location\s*[–-]\s*(Suite|Studio)\s*#\s*(\d+)/i.exec(decodeText(text));
  const siteCity = location && location[1].toLowerCase() === 'dtc' ? 'Denver' : 'Arvada';
  const address = siteCity === 'Denver'
    ? '8000 E Quincy Ave, Denver, CO 80237'
    : '7705 Wadsworth Blvd, Arvada, CO 80003';
  const categories = new Set(card.source_tags.map((tag) => categoryMap[tag]).filter(Boolean));
  const visible = decodeText(text);
  if (/permanent makeup.+cosmetic tattoo/i.test(visible)) {
    categories.delete('tattoo_artist');
    categories.add('permanent_makeup_artist');
  }
  if (/hair and makeup/i.test(visible)) categories.add('makeup_artist');
  if (categories.has('stylist') && /custom color|blonding|balayage|color correction|all over color|hair color|highlights/i.test(visible)) {
    categories.add('colorist');
  }
  if (categories.has('stylist') && /men[’']s grooming services/i.test(visible) && /beard service/i.test(visible)) {
    categories.add('barber');
  }
  const links = [];
  const a = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = a.exec(text))) {
    const url = m[1].replace(/&amp;/g, '&');
    if (isBookingHost(url) && !links.some((item) => item.url === url)) {
      links.push({ url, label: decodeText(m[2]) });
    }
  }
  return {
    ...card, professional_name: name, city: siteCity,
    address, suite: location ? location[2] + ' ' + location[3] : '',
    categories: [...categories].sort(), published_booking_links: links,
    needs_link_check: links.length > 0,
    review_reason: !name ? 'missing_professional_name'
      : !location ? 'missing_location_or_suite'
      : !categories.size ? 'missing_supported_category'
      : !links.length ? 'no_published_booking_platform_link'
      : null,
  };
}

async function getText(url) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoBookrDirectoryAudit/1.0)' },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.text();
    } catch (err) {
      last = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 750));
    }
  }
  throw new Error('Fetch ' + url + ': ' + (last && last.message));
}

async function audit(fetchText = getText) {
  const cards = parseDirectory(await fetchText(DIRECTORY));
  const profiles = [];
  // Sequential requests avoid a sudden traffic spike against the source.
  for (const card of cards) {
    try {
      profiles.push(parseProfile(card, await fetchText(card.profile_url)));
    } catch (err) {
      profiles.push({ ...card, error: String(err.message || err), review_reason: 'source_unavailable' });
    }
  }
  return {
    source_name: 'the MODERN SalonStudios',
    directory: DIRECTORY,
    checked_at: new Date().toISOString(),
    total_professional_pages: cards.length,
    candidates_with_booking_links: profiles.filter((p) => !p.review_reason).length,
    requiring_review: profiles.filter((p) => Boolean(p.review_reason)).length,
    note: 'Booking URLs require independent checks. This audit never writes to production or invents booking URLs.',
    profiles,
  };
}

async function main() {
  const report = await audit();
  const arg = process.argv.find((item) => item.startsWith('--output='));
  const json = JSON.stringify(report, null, 2) + '\n';
  if (arg) {
    const file = path.resolve(arg.slice('--output='.length));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, json);
    console.log('Wrote ' + file + ' (' + report.total_professional_pages + ' profiles)');
  } else {
    process.stdout.write(json);
  }
}

if (require.main === module) main().catch((err) => { console.error(err); process.exitCode = 1; });

module.exports = { parseDirectory, parseProfile, isBookingHost, audit, categoryMap };

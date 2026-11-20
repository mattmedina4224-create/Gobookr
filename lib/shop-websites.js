'use strict';
// A shop page links only to the business's own website.
//  * Directories, aggregators and social networks are never the business's website.
//  * Booking / site-builder platforms are, but only as the business's own page there (a subdomain such as
//    shop.square.site or a path such as vagaro.com/shopname), never the platform's bare homepage.
const DIRECTORIES = [
  'facebook.com', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'youtube.com', 'linkedin.com', 'pinterest.com', 'threads.net',
  'yelp.com', 'google.com', 'goo.gl', 'g.page', 'mapquest.com', 'yellowpages.com', 'bbb.org', 'tripadvisor.com', 'nextdoor.com',
  'map.contact', 'muse.ai', 'manta.com', 'chamberofcommerce.com', 'birdeye.com', 'superpages.com', 'citysearch.com', 'foursquare.com', 'nailsalonfinder.com',
];
const PLATFORMS = [
  'vagaro.com', 'booksy.com', 'squareup.com', 'square.site', 'glossgenius.com', 'getsquire.com', 'joinblvd.com', 'mangomint.com', 'zenoti.com',
  'booker.com', 'schedulicity.com', 'styleseat.com', 'fresha.com', 'acuityscheduling.com', 'setmore.com', 'linktr.ee', 'wixsite.com', 'godaddysites.com',
];
const NOT_OFFICIAL = DIRECTORIES; // kept for callers that list blocked domains
const on = (host, list) => list.find((d) => host === d || host.endsWith('.' + d));
function officialWebsite(value) {
  try {
    const u = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (on(host, DIRECTORIES)) return '';
    const platform = on(host, PLATFORMS);
    if (platform && host === platform && u.pathname.replace(/\/+$/, '') === '') return ''; // bare platform homepage
    return u.toString();
  } catch { return ''; }
}
module.exports = { officialWebsite, NOT_OFFICIAL, DIRECTORIES, PLATFORMS };

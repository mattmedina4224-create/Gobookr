'use strict';

// Business-facing labels for Tovara's Golden List categories. Values are the same as
// pro_categories so shop and professional searches share one category filter.
const SHOP_CATEGORY_LABELS = {
  barber: 'Barbershop',
  stylist: 'Hair salon',
  colorist: 'Hair color',
  nail_technician: 'Nail salon',
  eyelash_technician: 'Lash studio',
  eyebrow_technician: 'Brow studio',
  waxing_specialist: 'Waxing',
  esthetician: 'Skincare',
  threading_specialist: 'Threading',
  permanent_makeup_artist: 'Permanent makeup',
  tattoo_artist: 'Tattoo studio',
  massage_therapist: 'Massage',
  makeup_artist: 'Makeup',
  wedding_services: 'Bridal beauty',
  spray_tan_specialist: 'Spray tanning',
};

// Discovery crawler kinds -> category values. Kinds that do not identify a service
// (generic names, salon-suite buildings) map to no category rather than a guess.
const CRAWLER_KIND_TO_CATEGORY = {
  barber: 'barber', hair: 'stylist', nails: 'nail_technician', lashes: 'eyelash_technician',
  brows: 'eyebrow_technician', waxing: 'waxing_specialist', skincare: 'esthetician',
  permanent_makeup: 'permanent_makeup_artist', tattoo: 'tattoo_artist', massage: 'massage_therapist',
  makeup: 'makeup_artist', spray_tanning: 'spray_tan_specialist',
};

function shopCategoryLabel(value) { return SHOP_CATEGORY_LABELS[value] || ''; }

module.exports = { SHOP_CATEGORY_LABELS, CRAWLER_KIND_TO_CATEGORY, shopCategoryLabel };

// Category evidence from a business's own registered or mapped name (plus OSM shop/beauty tags).
// Returns Tovara category values; an empty list means "needs review", never a guess.
// Patterns are matched on a normalized, space-padded name so "nail" does not match "nailed it".
const NAME_RULES = [
  ['spray_tan_specialist', /\b(spray tan\w*|airbrush tan\w*|sunless|bronz\w*|tanning)\b/],
  ['nail_technician', /\b(nails?|manicures?|pedicures?|mani|pedi|nail bar|nail spa|nail lounge)\b/],
  ['barber', /\b(barbers?|barbershops?|barbering|fades?|shave|lady jane'?s|floyd'?s|sport clips|clipper\w*|gents?|grooming co|razor)\b/],
  ['tattoo_artist', /\b(tattoos?|ink|tattooing)\b/],
  ['massage_therapist', /\b(massage|bodywork|massage envy|hand and stone)\b/],
  ['eyelash_technician', /\b(lash\w*|eyelash\w*)\b/],
  ['eyebrow_technician', /\b(brows?|eyebrows?|microblad\w*)\b/],
  ['threading_specialist', /\b(threading)\b/],
  ['waxing_specialist', /\b(wax\w*|sugaring|sugar studio)\b/],
  ['permanent_makeup_artist', /\b(permanent makeup|pmu|microblad\w*|cosmetic tattoo)\b/],
  ['esthetician', /\b(esthetic\w*|aesthetic\w*|facials?|skin\w*|med ?spa|medical spa|dermaplan\w*|peel)\b/],
  ['makeup_artist', /\b(makeup|make up|cosmetics|glam)\b/],
  ['wedding_services', /\b(bridal|wedding)\b/],
  ['stylist', /\b(hair\w*|salons?|stylist\w*|styling|shears?|cuts|clips|tress\w*|mane|locs?|braid\w*|curl\w*|blow ?dry|blowout|coiffure\w*|beauty|supercuts|great clips|fantastic sams|cost cutters|smartstyle|regis salon|ulta)\b/],
];
const normName = (x) => ' ' + String(x || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
function classifyShop(name, tags = '') {
  const text = normName(name + ' ' + tags);
  const found = NAME_RULES.filter(([, re]) => re.test(text)).map(([value]) => value);
  // A "salon" that is clearly a nail/lash/brow/wax/tan studio is not also a hair salon unless hair words appear.
  if (found.includes('stylist') && found.length > 1 && !/\b(hair\w*|stylist\w*|cuts|braid\w*|blow ?dry|blowout|locs?)\b/.test(text)) {
    return found.filter((v) => v !== 'stylist');
  }
  return [...new Set(found)];
}
module.exports.classifyShop = classifyShop;

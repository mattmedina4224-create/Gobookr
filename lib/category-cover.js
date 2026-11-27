'use strict';

// Service photos used as a card cover when a listing has no photo of its own.
// They illustrate the kind of service, not the professional's own work, so cards
// always label them with the service name and swap to real photos once uploaded.
const SETS = {
  barber: ['/images/category-barber-v1.webp'],
  hair: ['/images/category-hair-v1.webp'],
  nails: ['/images/category-nails-v1.webp', '/images/category-nails-stock-v2.webp', '/images/category-nails-stock-v1.webp'],
  brows: ['/images/category-lashes-v1.webp', '/images/category-lashes-stock-v1.webp'],
  massage: ['/images/category-massage-v1.webp', '/images/category-massage-stock-v1.webp'],
  tattoo: ['/images/category-tattoos-v1.webp', '/images/category-tattoos-stock-v1.webp'],
};

const BY_CATEGORY = {
  barber: 'barber',
  stylist: 'hair', colorist: 'hair', makeup_artist: 'hair', wedding_services: 'hair', hair_salon: 'hair', salon: 'hair',
  nail_technician: 'nails', nail_salon: 'nails', nails: 'nails',
  eyelash_technician: 'brows', eyebrow_technician: 'brows', threading_specialist: 'brows', permanent_makeup_artist: 'brows', waxing_specialist: 'brows', lashes: 'brows',
  massage_therapist: 'massage', esthetician: 'massage', spa: 'massage', massage: 'massage',
  tattoo_artist: 'tattoo', tattoo_shop: 'tattoo', tattoo: 'tattoo',
};

function setFor(categories) {
  for (const raw of [].concat(categories || [])) {
    const key = String(raw || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
    if (BY_CATEGORY[key]) return BY_CATEGORY[key];
    for (const [name, set] of Object.entries(BY_CATEGORY)) if (key && (key.includes(name) || name.includes(key))) return set;
  }
  const text = [].concat(categories || []).join(' ').toLowerCase();
  if (/barber|fade|beard/.test(text)) return 'barber';
  if (/nail|manicure|pedicure/.test(text)) return 'nails';
  if (/lash|brow|wax|thread|microblad/.test(text)) return 'brows';
  if (/massage|spa|esthetic|skin|facial|wellness/.test(text)) return 'massage';
  if (/tattoo|ink|piercing/.test(text)) return 'tattoo';
  return 'hair';
}

// Stable per listing: the same card always gets the same photo, neighbours vary.
function categoryCover(categories, id) {
  const list = SETS[setFor(categories)];
  const n = Math.abs(Number(id) || 0);
  const src = list[n % list.length];
  const variant = Math.floor(n / list.length) % 3; // crop / mirror variety when a set has one photo
  return { src, className: `gb-cover-v${variant}` };
}

module.exports = { categoryCover };

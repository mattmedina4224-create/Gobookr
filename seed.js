'use strict';

// Seeds GoBookr with sample pros, services, portfolio items, reviews, and a
// couple of demo accounts so the site is browsable immediately.
//
// Safe to re-run: it wipes and rebuilds all tables first.

const db = require('./index');
const { hashPassword } = require('../lib/auth');
const { initialsFrom } = require('../lib/util');

const DEMO_PASSWORD = 'password123';

db.exec('DELETE FROM reviews; DELETE FROM booking_requests; DELETE FROM portfolio_items; DELETE FROM services; DELETE FROM pro_profiles; DELETE FROM sessions; DELETE FROM users;');
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('reviews','booking_requests','portfolio_items','services','pro_profiles','users');");

const insertUser = db.prepare('INSERT INTO users (email, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)');
const insertPro = db.prepare(
  `INSERT INTO pro_profiles (user_id, business_name, category, bio, city, state, price_min, price_max, years_experience, accent, initials)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertService = db.prepare('INSERT INTO services (pro_id, name, price, duration_minutes) VALUES (?, ?, ?, ?)');
const insertPortfolio = db.prepare('INSERT INTO portfolio_items (pro_id, accent, caption) VALUES (?, ?, ?)');
const insertReview = db.prepare('INSERT INTO reviews (pro_id, customer_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)');
const insertBooking = db.prepare(
  `INSERT INTO booking_requests (customer_id, pro_id, service_name, preferred_date, message, status, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

// ---- Demo customer accounts ----------------------------------------------
const customers = [
  ['Jordan Lee', 'jordan@example.com'],
  ['Priya Nair', 'priya@example.com'],
  ['Sam Okafor', 'sam@example.com'],
  ['Casey Brooks', 'casey@example.com'],
  ['Morgan Diaz', 'morgan@example.com'],
].map(([name, email]) => {
  const id = insertUser.run(email, hashPassword(DEMO_PASSWORD), 'customer', name, '').lastInsertRowid;
  return { id, name, email };
});

// ---- Sample pros -----------------------------------------------------------
const pros = [
  {
    name: 'Marcus Webb',
    business: 'Fade & Fellow Barbershop',
    category: 'barber',
    bio: "Third-generation barber specializing in sharp fades, tapers, and classic straight-razor lineups. Walk-ins welcome, but bookings get priority.",
    city: 'Denver', state: 'CO', priceMin: 25, priceMax: 60, years: 12, accent: 'violet',
    services: [['Skin fade', 35, 30], ['Classic haircut', 25, 25], ['Beard trim & line-up', 15, 15], ['Hot towel shave', 30, 30]],
    portfolio: ['Skin fade with hard part', 'Classic taper', 'Beard sculpt', 'Straight razor lineup'],
  },
  {
    name: 'Elena Cho',
    business: 'Elena Cho Color Studio',
    category: 'colorist',
    bio: "Balayage and dimensional color specialist. I trained in NYC and focus on low-maintenance color that grows out gracefully.",
    city: 'Denver', state: 'CO', priceMin: 120, priceMax: 350, years: 9, accent: 'gold',
    services: [['Balayage', 220, 180], ['Full color', 150, 120], ['Root touch-up', 90, 60], ['Toner refresh', 60, 30]],
    portfolio: ['Sun-kissed balayage', 'Copper melt', 'Ash blonde', 'Root smudge'],
  },
  {
    name: 'Devon Marsh',
    business: 'Devon Marsh Hair Co.',
    category: 'stylist',
    bio: "Precision cutting and modern styling for all hair types. I love a great consultation — we'll figure out what actually works for your texture and lifestyle.",
    city: 'Boulder', state: 'CO', priceMin: 55, priceMax: 140, years: 7, accent: 'teal',
    services: [["Women's cut & style", 75, 60], ["Men's cut & style", 55, 45], ['Blowout', 45, 30], ['Deep conditioning treatment', 35, 20]],
    portfolio: ['Textured lob', 'Curtain bangs', 'Layered blowout', 'Curly cut'],
  },
  {
    name: 'Yusuf Ibrahim',
    business: 'The Gentlemen’s Chair',
    category: 'barber',
    bio: "Old-school barbershop experience with modern technique. Specializing in fades, afro shape-ups, and beard design.",
    city: 'Denver', state: 'CO', priceMin: 30, priceMax: 65, years: 15, accent: 'slate',
    services: [['Fade + beard combo', 50, 45], ['Afro shape-up', 35, 30], ['Kids cut', 20, 20], ['Design lineup', 40, 30]],
    portfolio: ['Afro shape-up', 'Fade + beard combo', 'Design lineup', 'Kids cut'],
  },
  {
    name: 'Ren Tanaka',
    business: 'Ren Tanaka Studio',
    category: 'colorist',
    bio: "Vivid color and creative transformations — fantasy colors, money-piece highlights, and corrective color. I only take bookings by consultation first.",
    city: 'Aurora', state: 'CO', priceMin: 100, priceMax: 400, years: 6, accent: 'rose',
    services: [['Vivid color', 250, 210], ['Money-piece highlights', 130, 90], ['Color correction', 300, 240], ['Gloss treatment', 55, 30]],
    portfolio: ['Vivid pink transformation', 'Money-piece highlights', 'Silver fantasy color', 'Color correction result'],
  },
  {
    name: 'Grace Whitfield',
    business: 'Grace Whitfield Hair',
    category: 'stylist',
    bio: "Bridal and special-occasion styling plus everyday cuts. Known for effortless updos and healthy-hair-first color.",
    city: 'Lakewood', state: 'CO', priceMin: 60, priceMax: 220, years: 11, accent: 'violet',
    services: [['Bridal updo', 180, 90], ["Women's cut", 70, 50], ['Blowout & style', 55, 40], ['Extensions consult', 0, 20]],
    portfolio: ['Bridal updo', 'Soft glam waves', 'Precision bob', 'Half-up style'],
  },
  {
    name: 'Malik Johnson',
    business: 'Johnson Cuts',
    category: 'barber',
    bio: "Neighborhood barbershop vibes. Fast, clean, reliable cuts — most regulars are in and out in 20 minutes.",
    city: 'Denver', state: 'CO', priceMin: 20, priceMax: 45, years: 5, accent: 'gold',
    services: [['Standard cut', 25, 20], ['Fade', 30, 25], ['Beard trim', 12, 10]],
    portfolio: ['Clean standard fade', 'Sharp part design'],
  },
  {
    name: 'Ana Beltrán',
    business: 'Beltrán Color & Cuts',
    category: 'colorist',
    bio: "Curly and textured hair specialist. Color, cutting, and styling built around your natural pattern — no more fighting your curls.",
    city: 'Boulder', state: 'CO', priceMin: 90, priceMax: 260, years: 8, accent: 'teal',
    services: [['Curly cut', 85, 60], ['Curl color gloss', 110, 60], ['Deep treatment', 45, 30], ['Full highlight', 200, 150]],
    portfolio: ['Curl definition cut', 'Warm caramel gloss', 'Deep conditioning result'],
  },
];

const reviewLines = [
  'Absolutely loved the result — will be back!',
  'Professional, on time, and really listened to what I wanted.',
  'Best cut I’ve had in years. Highly recommend.',
  'Great experience from start to finish, very clean space too.',
  'A little pricier than I expected but worth it for the quality.',
  'They really know how to work with my hair type.',
  'Booked again the next week — that says it all.',
  'Friendly, skilled, and gave great advice for upkeep at home.',
  'Exactly what I asked for, no surprises.',
  'Consultation was thorough and the color turned out perfect.',
];

function daysAgoIso(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

let reviewCursor = 0;
let bookingCursor = 0;

for (const p of pros) {
  const email = p.name.toLowerCase().replace(/[^a-z]+/g, '.') + '@gobookr-demo.com';
  const userId = insertUser.run(email, hashPassword(DEMO_PASSWORD), 'pro', p.name, '').lastInsertRowid;
  const proId = insertPro.run(
    userId, p.business, p.category, p.bio, p.city, p.state, p.priceMin, p.priceMax, p.years, p.accent, initialsFrom(p.business)
  ).lastInsertRowid;

  for (const [name, price, duration] of p.services) {
    insertService.run(proId, name, price, duration);
  }
  for (const caption of p.portfolio) {
    insertPortfolio.run(proId, p.accent, caption);
  }

  // 2-5 reviews per pro from rotating demo customers, ratings mostly 4-5 with occasional 3.
  const reviewCount = 2 + (reviewCursor % 4);
  for (let i = 0; i < reviewCount; i++) {
    const customer = customers[reviewCursor % customers.length];
    const rating = [5, 5, 4, 5, 4, 3][reviewCursor % 6];
    const comment = reviewLines[reviewCursor % reviewLines.length];
    insertReview.run(proId, customer.id, rating, comment, daysAgoIso(3 + reviewCursor * 5));
    reviewCursor++;
  }

  // A couple of booking requests in varying states so both dashboards have data to show.
  const statuses = ['pending', 'accepted', 'completed'];
  for (let i = 0; i < 2; i++) {
    const customer = customers[bookingCursor % customers.length];
    const service = p.services[bookingCursor % p.services.length][0];
    const status = statuses[bookingCursor % statuses.length];
    insertBooking.run(
      customer.id, proId, service, '', 'Looking forward to it!', status, daysAgoIso(1 + bookingCursor * 2)
    );
    bookingCursor++;
  }
}

console.log(`Seeded ${pros.length} pros and ${customers.length} customers.`);
console.log('\nDemo logins (all use the password: ' + DEMO_PASSWORD + ')');
console.log('  Customer: jordan@example.com');
for (const p of pros.slice(0, 2)) {
  const email = p.name.toLowerCase().replace(/[^a-z]+/g, '.') + '@gobookr-demo.com';
  console.log(`  Pro (${p.category}): ${email}`);
}

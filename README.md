# GoBookr

A working marketplace for booking barbers, hairstylists, and colorists — like Thumbtack or Angie's List, scoped to hair pros. Customers search and browse pros, view profiles with services/portfolio/reviews, and request bookings. Pros manage their profile, services, and portfolio, and respond to booking requests. Customers can leave a review after a completed booking.

This is a **real, running full-stack app** — actual accounts, sessions, and a database — not a mockup. It's built with zero external dependencies: just Node.js's built-in `http` server and its built-in `node:sqlite` module. That means no `npm install` is required to run it, which also makes it trivial to read end-to-end.

## Running it locally

Requires Node.js 22.5+ (for built-in SQLite support). Check your version with `node -v`.

```bash
cd gobookr
npm run seed     # creates data/gobookr.db and fills it with sample pros, reviews, etc.
npm start        # starts the server at http://localhost:3000
```

Then open `http://localhost:3000`.

### Demo logins

All seeded accounts use the password `password123`.

- Customer: `jordan@example.com`
- Pro (barber): `marcus.webb@gobookr-demo.com`
- Pro (colorist): `elena.cho@gobookr-demo.com`
- (See `db/seed.js` for the full list — there are 8 seeded pros across barber/stylist/colorist categories.)

Re-running `npm run seed` wipes and rebuilds all data, so use it freely while testing.

## What's actually implemented

- Email/password signup and login for two account types: **customer** and **pro**, with hashed passwords (scrypt) and secure session cookies.
- Search and filter pros by category, city, and minimum rating.
- Pro profile pages with bio, services & pricing, a portfolio section, and reviews with a computed average rating.
- Booking request flow: a logged-in customer requests a service from a pro; the pro accepts/declines/marks it completed from their dashboard.
- Reviews: a customer can leave one review per pro, and only after that pro has marked one of their bookings "completed" — this prevents fake/drive-by reviews.
- CSRF protection on all state-changing form submissions for logged-in users.
- Fully responsive, single-stylesheet design (`public/styles.css`) — no build step, no framework.

## What's intentionally left out (v1 scope)

- **Photo uploads.** Portfolio "photos" are styled placeholder tiles with a caption instead of real images, since that needs file storage (e.g. S3/Cloudinary) which is a deployment-specific decision. Swapping in real uploads means adding an upload endpoint and an `image_url` column to `portfolio_items`.
- **Payments.** No payment collection — this models the "request a quote / get booked" flow like Thumbtack, not a checkout flow. Stripe Connect is the natural next step if you want to take payments or deposits.
- **Email notifications.** No emails are sent when a booking is requested or updated. Would need an email provider (Resend, Postmark, SES).
- **Calendar/availability.** Pros don't set actual available time slots yet; customers just propose a date. Real scheduling would need an availability model and probably a calendar UI.

None of these are architecturally hard to add — the data model already has the right shapes (`booking_requests`, `pro_profiles`, `services`) to build on top of.

## Project structure

```
server.js          # HTTP server, routing, sessions, CSRF, static file serving
db/index.js         # SQLite schema (users, pro_profiles, services, portfolio_items, reviews, booking_requests, sessions)
db/seed.js           # Sample data generator
lib/auth.js          # Password hashing + session management
lib/router.js        # Minimal Express-style router (path params, no dependency)
lib/layout.js         # Shared HTML page shell + nav
lib/http.js            # redirect/send/flash helpers
lib/util.js             # Formatting helpers (money, dates, star ratings, escaping)
routes/public.js         # Home, search, pro profile pages
routes/auth.js             # Signup, login, logout
routes/pro.js                # Pro dashboard: overview, requests, profile/services, portfolio
routes/customer.js             # Customer dashboard: their requests, leaving reviews, booking creation
public/styles.css                # The entire design system, one file
```

## Deploying it

This app keeps its data in a single SQLite file on disk (`data/gobookr.db`). That's what makes it dependency-free and easy to run anywhere — but it also means it needs a host with a **persistent filesystem and a long-running process**, not a serverless platform.

**Good fits (simplest path):** [Railway](https://railway.app), [Render](https://render.com), or [Fly.io](https://fly.io). All three run a normal Node process with a persistent disk. Typical steps: push this folder to a GitHub repo, connect it, set the start command to `npm start`, and attach a small persistent volume mounted at `data/`.

**If you specifically want Vercel:** Vercel's functions are serverless and stateless, so the SQLite file won't persist between requests there. You'd swap the database layer for a hosted Postgres instance (Vercel Postgres, Neon, or Supabase all work) — the SQL in `db/index.js` is close to standard enough that porting it is mostly a matter of swapping `node:sqlite` calls for a Postgres client (`pg` or an ORM like Prisma) and adjusting a few SQLite-specific bits (`datetime('now')`, `AUTOINCREMENT`). Worth doing once you're past the "does this concept work" stage and want production hosting with zero server management — see our earlier conversation on when that tradeoff is worth it.

## Security notes for going further

This is a solid MVP foundation, but before real users touch it: add rate limiting on login/signup, add email verification, consider moving off cookie-only sessions if you need "log out everywhere" support, and add server-side validation limits (max lengths, etc.) beyond what's here. None of this is hard — it's just not needed to prove the concept out.

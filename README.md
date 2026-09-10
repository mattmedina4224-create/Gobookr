# GoBookr

GoBookr is a discovery marketplace for appointment-based personal-service professionals. Customers can search for barbers, hairstylists, colorists, nail technicians, and similar local professionals, view their GoBookr profiles, and then book directly through the professional's existing scheduling provider.

The MVP deliberately keeps GoBookr as the **discovery layer**, not the scheduling system:

**Customer finds a pro → views the GoBookr profile → taps Book Appointment → continues to Square, Booksy, Vagaro, Fresha, GlossGenius, or another external booking page.**

The app is a real full-stack Node application with accounts, sessions, SQLite data, professional onboarding, portfolio uploads, location-aware discovery, license verification, and subscription foundations. It uses Node's built-in `http` server and `node:sqlite`; there is no application framework or build step.

## Local setup

Requires Node.js 22.5+.

```bash
cd Gobookr
npm run seed
npm run check
npm start
```

Then open `http://localhost:3000`.

`npm run seed` rebuilds the local demo database, so do not run it against data you want to keep.

### Demo logins

Seeded accounts use the password `password123`.

- Customer: `jordan@example.com`
- Professional: `marcus.webb@gobookr-demo.com`
- Professional: `elena.cho@gobookr-demo.com`

## Current MVP behavior

### Discovery

- Search by service category, city, ZIP code, name, or business.
- Optional browser geolocation for distance calculations.
- Professional cards show business/workplace information, pricing, reviews, portfolio imagery, license verification, and distance when coordinates are available.
- Professionals whose free trial has expired or whose payment grace period has ended are excluded from public discovery.

### Professional accounts

- Email/password signup and login.
- 30-day free professional trial.
- Required workplace information during signup.
- Multiple service categories per professional.
- Profile editing for business information, workplace address, bio, pricing, experience, license details, and booking URL.
- Address geocoding plus optional precise workplace GPS.
- Services management.
- Portfolio photo upload/delete flow (local disk storage for the MVP).
- Professional onboarding checklist.
- Billing page and account-wide billing warnings.

### Booking model

GoBookr does **not** own appointment availability or appointment scheduling in this MVP. A professional adds their existing booking URL and GoBookr sends customers there with a **Book Appointment** button.

The old internal `booking_requests` database table remains only for compatibility with seeded/historical data and the older review-verification model. New customer discovery does not create GoBookr booking requests.

### Billing

The codebase contains the Stripe subscription foundation for the professional plan:

- $15/month after the 30-day free trial.
- Stripe Checkout session creation.
- Stripe Customer Portal session creation.
- Stripe webhook signature validation.
- Subscription status synchronization.
- 7-day failed-payment grace period.
- Public-profile hiding after the grace period.
- Restoration after successful payment.
- Apple Pay can be surfaced by Stripe Checkout on eligible devices/browsers as part of Stripe's supported wallet experience.

Billing does **not** become live merely by running the app. Stripe environment credentials and end-to-end test-mode verification are still required before real payments should be enabled.

### Authentication and security foundations

- Passwords hashed with scrypt.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- CSRF protection for authenticated state-changing forms.
- Rate limiting for signup/login/password-reset/Google-auth entry points.
- Password reset tokens are hashed at rest, expire after one hour, and are single-use.
- Baseline response security headers.
- GitHub Actions runs `npm run check` on pushes and pull requests.

Production password-reset email delivery is **not implemented yet**. In development, the reset URL is printed to the server console.

### Google authentication

The backend can verify a Google Identity Services credential when `GOOGLE_CLIENT_ID` is configured. Existing accounts can be linked by verified Google email and signed in. The visible Google button and secure end-to-end new-account Google signup flow still need to be completed before Google signup should be advertised as available.

## Environment variables

See `.env.example` for the current environment names.

Key production values include:

- `NODE_ENV=production`
- `APP_URL=https://gobookr.com`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `GOOGLE_CLIENT_ID`
- `ADMIN_EMAIL`
- `TRUST_PROXY=1` only when the app is actually behind a trusted reverse proxy that sets the forwarded client IP

Never commit real credentials to the repository.

## Project structure

```text
server.js                      HTTP server, request parsing, routing, CSRF, static files

db/index.js                    SQLite schema and safe startup migrations
db/seed.js                     Local demo data

lib/auth.js                    Password hashing and sessions
lib/http.js                    Response, redirect, flash, and security headers
lib/layout.js                  Shared page shell/navigation
lib/pro-billing-banner.js      Professional billing warnings
lib/rate-limit.js              Authentication rate limiting
lib/router.js                  Minimal route matcher
lib/stripe.js                  Stripe API and webhook helpers
lib/subscription.js            Trial/grace/public-visibility rules
lib/util.js                    Escaping and formatting helpers

routes/auth.js                 Signup/login/logout/password reset
routes/google.js               Google credential verification/sign-in foundation
routes/public.js               Home/search/public professional profiles
routes/pro.js                  Professional dashboard/profile/services/portfolio
routes/onboarding.js           Professional setup checklist/social links
routes/customer.js             Customer dashboard and legacy review compatibility
routes/billing.js              Stripe Checkout/Portal/webhook and billing page
routes/admin.js                Manual license verification workflow
routes/legal.js                Terms and Privacy pages

public/styles.css              Base design system
public/discovery.css           Search/profile polish
public/location.js             Distance + GPS browser behavior
public/uploads/portfolio/      Local portfolio files at runtime
scripts/check.js               JavaScript syntax check
```

## Production items still required

Before public launch, complete and verify these items:

1. Configure Stripe in **test mode**, run checkout/webhook/customer-portal tests, then deliberately switch to production credentials.
2. Add production password-reset email delivery (for example Resend, Postmark, or SES).
3. Finish Google button + new-account Google signup only after the production Google client configuration is ready.
4. Move portfolio images from local disk to durable object storage such as S3, Cloudinary, or equivalent.
5. Choose production hosting and durable database/backups. The current SQLite design needs a persistent volume and should not be placed on stateless serverless storage as-is.
6. Review Terms of Service and Privacy Policy with qualified legal counsel.
7. Perform mobile, signup, search, profile, external-booking, billing, failed-payment, and account-recovery tests before launch.
8. Replace/retire the historical internal-booking review verification model with a verification approach appropriate for external bookings.

## Deployment note

The current database lives at `data/gobookr.db`, so the simplest deployment model is a long-running Node process with a **persistent disk**. If GoBookr later moves to horizontally scaled or serverless infrastructure, move the data layer to a managed database and move portfolio files to object storage first.

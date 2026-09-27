# GoBookr Owner Manual

This is the non-technical owner's map of GoBookr. GoBookr must remain operable if the original builder, an AI tool, or a contractor is unavailable.

## What GoBookr is
GoBookr is a marketplace for personal-service professionals and software that helps them get discovered, market themselves, and generate booking intent.

North star: **Help personal-service professionals fill more appointments.**

Current professional offer: **30-day free trial, then $20/month.**

## Who owns what
The business owner should keep administrative ownership of every production account. Never make a contractor, employee, or AI tool the only owner.

- **Source code:** GitHub repository `mattmedina4224-create/Gobookr`.
- **Hosting/deployments:** Vercel project `gobookr`.
- **Database/file storage:** Supabase project `GoBookr`.
- **Billing:** Stripe.
- **Domain:** `gobookr.com` and its registrar/DNS account.

Keep account recovery information, MFA recovery codes, billing contacts, and registrar access in a secure password manager. Never store passwords, API keys, recovery codes, or production secrets in this repository.

## Technical map
GoBookr is a Node.js application. `server.js` is the entry point. Routes live in `routes/`, browser assets in `public/`, database code/migrations in `db/`, shared server utilities in `lib/`, and checks in `scripts/` and `tests/`.

It requires Node.js 22.5 or newer. Normal commands:

```sh
npm install
npm run check
npm start
```

A passing project check is not proof every user flow works. Important releases should also be exercised in a Vercel preview.

## Production data
Production data is PostgreSQL hosted by Supabase. Schema changes must be captured as migrations so another developer can recreate the system rather than relying on undocumented production edits.

Supabase Storage holds professional portfolio media. Production secrets are server-only. Never expose a Supabase secret/service-role key to browser code.

Before a destructive database change, confirm a recoverable backup exists and document the rollback plan.

## Deployments
GitHub `main` is the source of truth. Feature work should normally use a branch and pull request. Vercel creates previews for pull requests and deploys production from the configured production branch.

Safe release flow:
1. Branch from current `main`.
2. Make one focused change.
3. Run project checks.
4. Open a pull request and inspect the Vercel preview.
5. Merge only after required checks pass.
6. Confirm the merged commit's production deployment before declaring it live.

Do not make production-only application changes in the Vercel dashboard when they belong in source control.

## Environment variables
The canonical list of required variable names is `.env.example`. Current groups include database, Supabase Storage, Stripe, Google Identity, application URL, and proxy configuration.

Real values belong in the appropriate secret/environment manager, never GitHub source files or documentation.

## Critical product boundaries
A professional owns their identity. A business owns its identity. GoBookr connects both to the customer.

Favorites and future Following are separate. A Favorite is a customer's private saved professional. Professional analytics may show aggregate Saves, not the identities of customers who saved them.

A booking click is not a completed appointment. Analytics must not present clicks as completed bookings.

Imported professionals must not receive invented reviews, services, results, availability, or fake activity. Claiming attaches ownership to an existing profile instead of creating a duplicate.

## If the site goes down
1. Check whether `gobookr.com` loads and whether the problem affects one page or the whole application.
2. Check the latest Vercel production deployment and logs.
3. Identify the exact GitHub commit deployed.
4. Check Supabase/database health if data-backed pages are failing.
5. If the latest release caused the outage, prefer reverting it over unreviewed emergency edits.
6. Preserve logs/error details before changing multiple things.

Never rotate keys, delete data, reset the database, or change DNS as a first troubleshooting step.

## If the current builder disappears
A competent Node.js/PostgreSQL developer should receive repository access, this manual and other `docs/` files, appropriate Vercel/Supabase access, Stripe access only when needed, and a fresh local environment populated through the owner's secret manager.

They should begin with `README.md`, `AGENTS.md`, `.env.example`, `server.js`, `routes/`, and `db/`, then run `npm run check` before changing anything.

No future developer should need an old ChatGPT conversation to understand a production-critical GoBookr feature. Decisions affecting operation, security, data, billing, or architecture belong in the repository.

## Documentation rule going forward
Every major feature should leave enough documentation for another developer to answer:
1. What does this feature do?
2. Where is its code and data?
3. What external service or secret does it depend on?
4. How do I verify it works and safely undo a bad release?

Update this manual whenever architecture, hosting, billing, domain ownership, recovery, or another production-critical dependency changes.

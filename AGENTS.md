# GoBookr — Codex Project Instructions

## Product mission
GoBookr is a marketplace/directory for appointment-based personal-service professionals. Customers browse real local professionals, evaluate profiles, and book through the professional's booking provider. Professionals can claim and manage their profiles.

The product owner uses ChatGPT as the project manager. Codex is the implementation engineer. Product behavior, pricing, branding, marketplace policy, and major architecture changes should follow the requirements in this repository or the task provided by the project manager; do not invent major product decisions.

## Current product direction
- Customer-facing brand: **GoBookr** (capital G and B).
- Domain: `gobookr.com`.
- Professional plan: 30-day free trial, then $15/month.
- Primary categories: barbers, hairstylists, colorists, nail technicians, eyelash technicians, eyebrow/brow professionals, waxing specialists, tattoo artists, massage therapists, and similar appointment-based personal services.
- GoBookr is not intended to become a broad home-services marketplace.
- Search should support service/category, city or ZIP, professional/business name, rating, and eventually geographic radius.
- Desired radius choices: 1, 2, 3, 4, 5, 10, 15, and 20 miles.

## Technology and deployment
- Node.js / Express-style custom routing application.
- Production database: Supabase Postgres.
- Deployment: Vercel.
- Source control: GitHub, default branch `main`.
- Billing: Stripe.
- The application began with a synchronous SQLite-style database interface. Production now uses Postgres through `db/index.js` and `db/postgres-worker.js`. Treat this compatibility layer as transitional technical debt.

## Performance rules
Performance is a high priority as the marketplace grows.

- Never introduce N+1 database-query patterns.
- For lists of professionals, bulk-load related categories, services, subscriptions, reviews, and portfolio information rather than querying once per professional.
- Prefer a small, bounded number of Postgres queries per page/request.
- Search must be designed to scale well beyond the current number of profiles.
- Do not treat short-lived application caches as a substitute for fixing inefficient database access.
- Preserve existing indexes and add justified indexes when query plans require them.
- When working on performance, measure or otherwise verify the bottleneck where practical and report what changed.

## Real-professional marketplace data
GoBookr is now populated with real professionals found from public sources. Data quality and provenance are mandatory.

### Import pipeline
The desired pipeline is:
1. Discover a professional from an approved public source.
2. Validate that the professional/listing appears current and factual.
3. Check for an existing GoBookr profile before insertion.
4. Normalize the professional's category and location.
5. Create an **unclaimed** profile with no fabricated GoBookr user account.
6. Store the public source URL/name and the date it was checked.
7. Flag ambiguous or conflicting records for review rather than guessing.
8. Publish only records that meet the validation rules.

### Required rules
- Seeded/public-source profiles must use `user_id = NULL` and `claim_status = 'unclaimed'`.
- Never create fake customer or professional accounts to represent imported professionals.
- Never fabricate reviews, ratings, credentials, licenses, services, addresses, social accounts, booking links, photos, or biographical claims.
- Do not copy authored bios, reviews, or copyrighted portfolio photos from third-party platforms into GoBookr unless the project explicitly has rights to do so.
- Factual public fields such as business/professional name, city, state, business address, booking URL, and public source provenance may be stored when supported by the source.
- Every imported listing should have `source_url`, `source_name`, and `source_checked_at` when available.
- Check duplicates before insert. Duplicate logic should consider professional/business name, location, source URL, and other useful identifiers rather than relying on a single weak field.
- If a source changes location or identity in a way that creates uncertainty, flag/skip the record rather than silently overwriting it.
- Prefer controlled, verifiable import batches. Automation should increase throughput without lowering data quality.

### Approved discovery/booking sources
Current approved sources include Boulevard, GlossGenius, Mangomint, Zenoti, Booker, Square Appointments, Vagaro, SQUIRE, and Booksy. A source being approved does not mean every field on it should be copied.

## Category model
`pro_categories` is the authoritative multi-category relationship for discovery/search. Do not assume the legacy `pro_profiles.category` column can represent every supported category.

Supported marketplace categories currently include:
- `barber`
- `stylist`
- `colorist`
- `nail_technician`
- `eyelash_technician`
- `eyebrow_technician`
- `waxing_specialist`
- `tattoo_artist`
- `massage_therapist`

When changing category behavior, keep database constraints, signup/onboarding validation, search, profile display, imports, and admin tools consistent.

## Claim flow
The intended ownership flow is:

`Unclaimed profile -> Claim this profile -> create/login -> verify ownership -> attach profile to user -> professional completes/edits profile -> 30-day GoBookr Professional trial starts`

- Ownership verification must rely on meaningful evidence, not merely a matching name.
- An unclaimed profile should remain publicly useful before it is claimed.
- Claiming must not accidentally create duplicate professional profiles.
- GoBookr needs a correction/removal/reporting path as the imported marketplace grows.

## Billing rules
- GoBookr Professional is $15/month after a 30-day free trial.
- Do not create real Stripe charges, subscriptions, refunds, or other financial actions without explicit authorization for that action.
- Preserve the existing Stripe billing flow unless the task explicitly calls for changing it.

## UI and brand guardrails
- Brand colors: navy `#0B1F3A`, white, bright blue `#2563EB`.
- Visual direction: clean, modern, approachable, with typography similar in feel to ChatGPT rather than an industrial/dark aesthetic.
- Existing approved homepage and mobile header should be preserved unless the task explicitly requests a redesign.
- The approved logo/favicon concept is a navy square with a white calendar grid, one bright-blue date square, and GoBookr branding.
- Keep the favicon consistent across pages.
- Mobile usability matters; do not treat mobile as an afterthought.
- Avoid unrelated visual changes while fixing backend/performance issues.

## Security and privacy
- Never commit secrets, database credentials, API keys, Stripe secret keys, tokens, or private customer information.
- Keep authentication, authorization, CSRF protections, and session security intact when refactoring.
- Validate and sanitize user-controlled input.
- External URLs shown to customers must be validated as safe HTTP/HTTPS URLs.
- Imported marketplace data should be limited to appropriate public professional/business information.

## Database/change safety
- Production data is valuable. Avoid destructive migrations or broad production updates unless explicitly required and understood.
- Migrations should be forward-safe and narrowly scoped.
- Do not run legacy SQLite seed scripts against production Postgres.
- Preserve existing profiles and claim state when changing schemas.
- When importing data, make operations idempotent where practical.

## Engineering workflow
For each meaningful task:
1. Inspect the relevant existing code before editing it.
2. Understand the current behavior and preserve unrelated approved behavior.
3. Implement the smallest coherent solution rather than accumulating patches.
4. Run available tests, linting, syntax checks, or targeted verification when the environment permits.
5. Check important error paths and mobile/customer-facing behavior when relevant.
6. Summarize files changed, verification performed, and any remaining risks or manual deployment/configuration steps.

When a problem is architectural, fix the architecture rather than layering repeated caches/workarounds on top of it.

## Current engineering priorities
Unless a newer project-manager task overrides these, prioritize:
1. Fast, scalable homepage/search/profile loading against Supabase Postgres.
2. Reliable search and category behavior as profile count grows.
3. A safe automated ingestion pipeline for real Colorado professionals with deduplication, provenance, validation, and review/exception handling.
4. Strong claim/ownership verification and correction/removal workflows.
5. Expansion of marketplace inventory without sacrificing data quality.
6. Continued production hardening for Vercel, Supabase, Stripe, auth, and mobile UX.

## Decision rule
If a requested implementation conflicts with these instructions or requires a significant new product decision, stop and clearly surface the conflict/decision instead of silently choosing a new direction. For normal implementation details, use sound engineering judgment and keep moving.
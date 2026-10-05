# Profile polish acceptance log

PR: https://github.com/mattmedina4224-create/Gobookr/pull/136

## Implemented

- Business banners crop consistently, use a neutral fallback when absent or invalid, and fall back after an image load error. Owner settings provide a banner URL editor and saved preview; this does not add file uploading.
- Staff membership matches business name, city, state, street, ZIP and suite. Incomplete addresses and other branches do not match. A professional links back to a uniquely matching public business; ambiguous matches remain unlinked.
- License badges require a recorded registry review matching the current professional name, license number and state, an active status, confirmed identity, reviewer, source URL and future expiration. Legacy flags alone cannot display a badge. Name/license changes invalidate verification. Admins can record or revoke a review.

## Evidence

- Full automated suite after removing the unsuccessful preview viewport helper: 215 passed, 0 failed, 0 skipped (2026-10-05). Includes real disposable Postgres tests for matching, owner-only edits, admin permissions, review validation and revocation. Test identities never entered production or the shared preview database.
- Preview HTTP GET /shop/1 returned 200, with Zen Therapies, its exact workplace address, a neutral banner, and Sheila O’Shaughnessy linked at /pro/522; no verified-license badge was rendered.
- Nullable license_verification JSONB column added idempotently to isolated preview and production. No existing profile values, owners or booking links were modified. Production query after migration: 501 profile rows, 0 verified flags, 0 recorded reviews. These are database row counts, not a certified count of legitimate public listings.
- One real business was added only to the isolated preview using the existing professional's attributed workplace fields. No invented business, address, photo or license was published.
- First application commit 3f8bb8b passed GitHub checks. Later viewport-helper commit 8de65a7 failed server-harness tests; the helper and server hook were removed. Full local suite passed again. Latest remote checks must be checked separately.

## Outstanding acceptance / blockers

- Mobile and desktop browser acceptance remains incomplete: the browser navigation timed out. HTTP output and automated route tests do not establish visual acceptance.
- Preview owner/admin accounts are not available for signed-in browser tests. Owner edits and admin reviews have automated route/database evidence, but not mobile/desktop browser evidence.
- Uploaded/loaded and broken-photo appearance still need browser screenshots; no before/after screenshots are claimed.
- No actual professional license was verified in this work. Real registry review remains an authorized admin task.
- PR must not be merged until required preview/mobile/desktop acceptance and current checks pass.

The existing production design is unchanged by this open PR. Only the additive nullable database column has reached production.

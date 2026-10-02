# GoBookr launch work log — 2026-10-02

## Inventory evidence

- Live visibility audit: 496 source-attributed public profiles; 185 have no booking URL; gap to 500 is 4. This is a database visibility count, not a fresh independent verification of all 496 sources.
- Requested `gobookr_master_inventory.csv` and `merge_inventory.py` were absent from supplied attachments and exact/stem Library searches. Zero of that 202-row batch were imported or reverified.
- Three independently sourced candidates are stored in `data/imports/launch-nonbarber-2026-10-02.json`. Their source, contact/about and booking pages were opened. Dry run against production found zero duplicate matches.
- First real insert attempt rolled back atomically because production's category constraint lacks `makeup_artist`. Follow-up query confirmed zero candidate profiles were inserted. A forward-safe constraint expansion is included in this PR; no existing profile data is overwritten.
- Discovery holds/rejections: Kaylyn Lewis (Woodland Park) and Emma Riley (Colorado Springs): street/ZIP not confirmed; Danielle Armentrout: individual service attribution unclear; Referral Patterns: Indiana; Samantha C Beauty: Missouri. These are separate discovery candidates, not rows from the missing CSV.

## Changes in this PR

- Importer deduplicates canonical booking URLs or normalized name + workplace + ZIP, rejects unverified snippets and missing address/ZIP/booking, preserves provenance in reports, serializes and atomically commits writes. Shared booking URLs with different identities require review.
- Correct robots.txt literal backslash/newline output.
- Filter business staff through bounded public-listing hydration; add an honest gradient cover fallback and safe staff image URLs.
- Require an actual verification flag plus license details before public profile/staff badges. Production currently has zero verified-license flags.
- Label service/team booking pages as business booking; remove the homepage's blanket verified-professionals claim.
- Explain manual social scheduling and distinguish GoBookr publication from automatic social posting.
- Add professional onboarding/claim/FAQ and a demo-video script, shot list and recording steps. No rendered video or native app is claimed.
- Add a preview-only same-origin 375px/1024px frame for responsive verification. Production remains frame-denied and has no verification route. Preview HTML permits same-origin framing; external frames and private harness paths are rejected.

## Verification and remaining gates

- 217 automated tests passed, zero skipped, including isolated Postgres claim and importer flows. The new category migration is being checked with real Postgres-compatible constraints.
- Syntax and repository import-file audit passed before the final migration addition; CI must pass on the exact PR head.
- A Vercel preview at 375px and desktop is required before merge. Results belong in the PR and final report.
- Only live Stripe account access is available. No live billing action was taken. Provider-level test trial conversion/cancellation/failed payment remain blocked pending test-account access.
- Automatic social integration is unconfirmed. Existing scheduling remains a manual-post queue.
- The full inventory-wide booking audit, visit/search instrumentation, complete authenticated browser walkthrough and broad city/category SEO work remain incomplete.

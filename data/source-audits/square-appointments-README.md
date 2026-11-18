# Square Appointments — official public booking page discovery

## Why Square requires a different importer
Square booking pages can be individually indexed and display service names, a business address, individual team-member names, and staff-specific "Book now" links. Unlike MY SALON Suite, there is **no first-party nationwide public sitemap of all Square Appointment businesses** established by this audit. Square Go is a separate consumer marketplace, not an authorized bulk seller export.

We must therefore **discover pages by state, city and service category**, maintain source provenance, and never assert complete national coverage just from a collection of URLs. Square APIs are scoped to authorized sellers; do not use merchant tokens or private endpoints to access other sellers' data.

## Arizona proof of concept (November 18, 2026)
- 24 publicly indexed first-party Square booking pages loaded, Phoenix and Scottsdale.
- 40 staff entries with bookable team cards found.
- 21 candidate entries passed basic name, address and staff-link structure checks; 19 held (incomplete/one-word staff names, "No Preference" or missing identity).
- Staff-link HTTP tests: 8 succeeded; 13 returned HTTP 429 rate limiting. **429 is not a broken booking URL**, but it is not independently verified bookability either.
- Chose 7 named pros with confirmed staff booking links (and excluded the ambiguous nickname "BIG MIKE").
- **7 new unclaimed profiles** published in GoBookr production, IDs **16434–16440**, with 8 category associations. Zero existing duplicate matches, 7/7 live GoBookr profile pages HTTP 200, 7/7 GoBookr booking routes HTTP 302 to staff-specific published Square endpoints. No claimed profile touched.

## Repeatable read-only auditor
```bash
node scripts/audit-square-appointments.js data/source-audits/square-appointments-az-seeds.json --output=tmp/square-az-audit.json
```
The tool gathers exact first-party service names and staff booking targets, logs review-only category suggestions, and flags incomplete names/addresses. It is **never an auto-publisher**. It waits between merchant pages and does not probe every staff endpoint to avoid Square booking-system throttling.

## Next batch
Add publicly indexed business booking pages from each state's major cities, across barber, hair, color, nails, lashes, brows, waxing, tattoo, massage, makeup and skincare. Review categories against specific services, check direct booking targets with conservative rate limits, reject shared/placeholder booking URLs and strict deduplicate against existing GoBookr records. Only then promote unclaimed profiles. No fake ratings or license verification.

Tracking: https://github.com/mattmedina4224-create/Gobookr/issues/283

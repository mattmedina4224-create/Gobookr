# Phenix Salon Suites Arizona source audit — 2026-11-17

## Origin and scope
First-party public directories at https://az.phenixsalonsuites.com/ for 8 AZ locations (Arrowhead / Peoria, Glendale, Mesa, Paradise Valley / Phoenix, Scottsdale, Surprise, Tucson Campbell Plaza, Tucson Williams Centre). Structured professional permalinks from https://az.phenixsalonsuites.com/wp-json/wp/v2/professionals?per_page=100&page=N.

This archive contains **97 prepared booking candidates** split across four JSON files `phenix-arizona-source-part-{1..4}.json`. These are **source audit files, not input for the generic `scripts/import-unclaimed-profiles.js`**. Source record shape is `[name, workplace, city, street, ZIP, suite, category_bits, booking_url, source_url]`. `source_url` is the individual's Phenix professional page; `booking_url` is the original first-party directory's outward `Book Now` link.

Categories by bit:
`1 barber; 2 stylist; 4 colorist; 8 nail_technician; 16 eyelash_technician; 32 eyebrow_technician; 64 waxing_specialist; 128 tattoo_artist; 256 massage_therapist; 512 makeup_artist; 1024 esthetician; 2048 permanent_makeup_artist; 4096 threading_specialist`.

## Result
- 329 rows in the eight official regionally hosted location directories.
- 125 had a visible outbound `Book Now` link.
- 110 had a directly supportable GoBookr category and a `Book Now` link.
- 12 of those were held because the booking target was a malformed URL, generic business website or link hub, rather than a verified scheduling service.
- The resulting 98 candidate booking links were checked: 96 HTTP 200, one dead DNS hostname (excluded), and one 403 after redirect to SQUIRE (retained with caveat).
- 97 records in the four source-audit files; two pairs shared the same booking URL.
- The import selected one row per booking URL and **published 95 new unclaimed profiles** in production GoBookr, IDs **16308–16402**, with **148** category links. All 95 public profile pages and 95 booking redirects worked in post-import testing.

The duplicated external booking destinations are:
- `https://sonoranstrands.glossgenius.com/` (Julia Wilkens and Andreya Blake, Surprise)
- `https://kelsiewhitehead.glossgenius.com/` (Kelsie Whitehead and Alyssa Bradley, Phoenix)

The 219 other records were not published in this pass (missing verified direct booking URLs, ambiguous or unsupported tags). Another 12 were held for unapproved booking targets. No fictional booking URLs were created.

## Four remaining Arizona locations
Phenix's separate official national listing at https://phenixsalonsuites.com/states/arizona/ shows 12 Arizona locations. Four were **not available in the eight regional site directories**:
- Phoenix (Ahwatukee Foothills Towne) https://phenixsalonsuites.com/locations/phoenix/
- Chandler https://phenixsalonsuites.com/locations/chandler/
- Gilbert / Mesa https://phenixsalonsuites.com/locations/gilbert/
- Tempe https://phenixsalonsuites.com/locations/tempe/

The national site's ordinary automated requests returned HTTP 403 at audit time; it was not used to invent booking links or import unverified profiles.

## Repeatability
The regional professional directories expose structured `post-{id} professionals` HTML blocks and public WordPress REST professional pages. Refresh these directories, compare exact professional permalinks, service tags, and booking URLs, and require fresh checks before importing. Do not overwrite claimed profiles or add a profile without a real external booking destination; allow a separate contact-only flow if designed intentionally.

Tracking: [GoBookr issue #276](https://github.com/mattmedina4224-create/Gobookr/issues/276).

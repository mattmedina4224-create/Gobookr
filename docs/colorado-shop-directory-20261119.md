# Colorado shop directory — progress report (2026-11-19)

## Results

These counts separate discovered candidates, rows in the database, and pages verified on the live site.

| Metric | Result |
|---|---|
| Colorado communities covered (cities with ≥1 published shop) | 197 |
| Candidate businesses discovered (DORA active shop registrations + OSM places) | 8,221 |
| Verified unique business locations published (new this run) | 4,808 |
| Existing businesses skipped as duplicates | 121 (33 matched existing shops; 88 duplicate candidates) |
| New production shop pages created | 4,808 (ids 86–4893) |
| Total Colorado shop pages in production | 4,893 |
| Shop pages with a working official website | 582 |
| Shop pages with a street address | 525 (DORA publishes city + ZIP only) |
| Shop pages with a ZIP code | 4,855 |
| Shop pages missing a website | 4,311 |
| Businesses held for review (not published) | 3,292 + 22 existing shops without a category |
| Businesses visible on live GoBookr | 4,893 via /shop/:id and city/name search. Category search shows them once PR #299 is deployed. |
| Failed or blocked sources | 3 (see below) |

All shops are unclaimed with `owner_user_id = NULL`. No accounts, staff links, phones or emails were created.

### Published by category (a shop can have several)

| Category | Shops |
|---|---|
| Hair salon (stylist) | 2,381 |
| Nail salon | 919 |
| Skincare (esthetician) | 634 |
| Barbershop | 615 |
| Lash studio | 174 |
| Waxing | 114 |
| Massage | 92 |
| Tattoo studio | 52 |
| Makeup | 50 |
| Brow studio | 48 |
| Spray tanning | 22 |
| Threading | 10 |
| Permanent makeup | 9 |
| Bridal beauty | 3 |

### Top cities (shops / with website)

Denver 793 / 105 · Colorado Springs 540 / 94 · Aurora 252 / 19 · Fort Collins 200 / 40 · Grand Junction 187 / 75 · Lakewood 157 / 26 · Littleton 150 / 4 · Westminster 126 / 5 · Arvada 121 / 27 · Centennial 116 / 15 · Loveland 113 / 8 · Boulder 108 / 20 · Thornton 104 / 8 · Pueblo 95 / 6 · Parker 94 / 13 · Longmont 87 / 6 · Greeley 85 / 10 · Lone Tree 67 / 1 · Castle Rock 67 / 8 · Greenwood Village 65 / 9 · Englewood 65 / 3 · Highlands Ranch 62 / 7 · Wheat Ridge 61 / 9 · Broomfield 55 / 5 · Brighton 45 / 3 · Durango 40 / 2 · Lafayette 34 / 1 · Northglenn 32 / 2 · Golden 30 / 4 · Montrose 30 / 0. The full list is in `colorado-import-20261119/summary.json`.

## Sources and rules

- **DORA dataset 7s5z-vewr, license type REG (Barber/Cosmetology Shop Registration).**
  - This is public-domain data, reloaded daily. Every place of business doing barbering, cosmetology, hair, nails or esthetics must hold one, including each separate salon suite.
  - Of 23,275 registrations, 7,344 are active in Colorado.
  - Published only when the record is active and has a name, city, ZIP, and a category word in the registered name. Those shops are `operational_status = 'verified'`.
- **OpenStreetMap (2,519 mapped places, ODbL, attributed).**
  - Published only with a city, a category and a website that loaded in the 2026-11-19 check.
  - Locations come from OSM coordinates (406 shops), so radius search works for them.
- **Websites.**
  - 899 checked: 706 loaded, 100 dead, 41 refused the request, 52 errored.
  - Only sites that loaded are linked. Nothing was guessed.
- **Categories** are inferred from words in the registered or mapped name, for example "Nail Spa" → nail salon. Each is stored with `source = 'registered_name'` so it can be reviewed. Names with no service word are held, not guessed.

## Held for review (`colorado-import-20261119/review.json`)

| Reason | Count |
|---|---|
| Name does not say what service the business offers (e.g. "Bee Smooth LLC") | 1,959 |
| OSM place with no website | 864 |
| No city on the record | 211 |
| OSM website did not load | 158 |
| Beauty school or academy | 90 |
| Salon inside a private facility (senior living, school district) | 10 |

Existing shops to review:
- **Bare Necessities Floating & Massage (id 85):** its website domain no longer resolves. It's flagged, not removed.
- **22 existing shops have no category word in their name**, e.g. "Goldie x Bob" and "The Kasual Kut". Their pages work, but category search can't find them.

## Failed or blocked sources

1. The DORA metadata endpoint and the national OSM mirror overpass.kumi.systems returned 502 on the first run. Fixed by matching DORA's real field names and adding overpass-api.de.
2. GitHub artifact downloads are blocked from the agent sandbox, so results are committed to the `data/colorado-shop-discovery` branch instead.
3. Vercel tries to build the data branch and fails. This is harmless, and no app code is on that branch.

Not yet used: chambers of commerce, municipal directories, Booksy, Vagaro, GlossGenius and the other booking platforms. Those are the next sources for the 1,959 uncategorized and 211 cityless records.

## Weekly refresh

`.github/workflows/colorado-golden-shop-discovery.yml` runs Mondays at 14:19 UTC and on demand. Each run:
1. Pulls DORA and OSM.
2. Checks websites.
3. Dry-runs the import against the committed shop export.
4. Commits the report to `data/colorado-shop-discovery`.

It does not write to production. Publishing stays an audited step, so a site that's temporarily down never removes a shop. Three manual runs on 2026-11-19 succeeded: 44599935400, 44600410222 and 44601400689.

## Import mechanics (for repeat runs)

1. Run `node scripts/import-colorado-shops.js <candidates.json> --existing=<shops export> --websites=<checks>`. It writes `publish.json`, `review.json`, `skipped.json` and `enrich.json`, plus guarded batch SQL.
2. The 4,808-row import came from `publish-compact.json` (md5 `bdfcea06…bfc`), pinned to commit `000a938`.
   - Production fetched it through a temporarily enabled `http` extension and checked the checksum before inserting. The extension was dropped afterwards.
   - The guards are: same `source_external_id`, same DORA license, or same name + city + ZIP.
   - Rerunning the import inserts nothing; verified locally.

## Owner and staff onboarding (Phase 6)

These flows already exist and were not changed:
- Shop claim: `/shop/:id/claim`.
- Business-team invitations, with optional paid seats.
- Professionals' own $20/month subscription after the 30-day trial.

One change: unclaimed shop pages now say that listed professionals *named this business on their own profiles* and are not confirmed staff.

End-to-end claiming in production was not exercised, because it needs real owner accounts. No Stripe actions were taken.

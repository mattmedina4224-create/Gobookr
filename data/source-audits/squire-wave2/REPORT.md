# SQUIRE nationwide import — status (2026-11-18, end of session)

Status: **5,000 target not reached; 500 milestone not reached.** Production holds **389** SQUIRE profiles.

## Metrics

| Metric | Result |
|---|---|
| SQUIRE profiles before wave 2 | 253 |
| SQUIRE profiles at start of the 5,000 brief | 350 |
| Individual barber pages read first-party (wave 2) | 148 |
| Verified (passed validation) | 144 |
| Imported to production (wave 2) | 136 (ids 16706–16841); 39 of them under the 5,000 brief |
| Total production SQUIRE profiles | 389 |
| Production SQUIRE rows with an individual `/barber/` booking URL | 255 distinct (the other 134 are older rows with shop-level links) |
| Duplicates rejected | 8 |
| Unverifiable records rejected | 4 |
| States with SQUIRE profiles | 19 |
| Cities with SQUIRE profiles | 52 |
| Shops with SQUIRE profiles | 152 |
| Cities / shops inspected in wave 2 | 33 / 95 (see `inventory.csv`) |

## Batches

| Batch | Metros | Pages | Imported | Production ids |
|---|---|---|---|---|
| b01 | Atlanta, Houston, Dallas, LA, Miami, Philadelphia, Phoenix | 40 | 39 | 16706–16744 |
| b02 | Seattle, Boston, San Francisco, San Diego, Charlotte | 29 | 27 | 16745–16771 |
| b03 | Nashville, Denver, Austin, Las Vegas, Tampa, Chicago | 39 | 31 | 16772–16802 |
| b04 | NYC/Brooklyn, Orlando, Detroit area, Minneapolis, Portland, San Antonio, Baltimore, Indianapolis, Sacramento | 40 | 39 | 16803–16841 |

Rejections: `Javier(erick) Martínez` (nonstandard display name), `Kendriz Guaba` (no services), `Germs Del rio` (malformed address), `Victor Garibay` (shop name printed as "Victor Garibay at Crafted Illusion" — flagged, not guessed).

## Verification after each batch

- Read-only duplicate check, then a guarded insert (NOT EXISTS on booking URL and on name + city + state); `user_id = NULL`, `claim_status = 'unclaimed'`; no existing row changed.
- Every new row has an individual `/barber/` URL, a numbered street and a 5-digit ZIP; 0 duplicate individual URLs in `pro_profiles`.
- `/book/{id}` on production returns 302 to the barber's SQUIRE page (first and last id of each batch). This proves the link only, not appointment availability.
- City search: production `/search?category=barber&location=Portland, OR` lists the new Portland barbers.

## Phase 1 findings: SQUIRE's public structure

- `https://getsquire.com/discover/united-states` could not be read: fetching it needed an approval that nobody answered, so it was not retried.
- City pages exist (`/discover/united-states/{state}/{city}`, e.g. Austin shows "42 results", Minneapolis "4 results"), but the readable copy has **no links, no pagination controls and only part of the listings** — the directory is rendered by JavaScript. Shop pages list barbers by short name only (e.g. "Will B.") with no links.
- The workspace shell cannot reach getsquire.com at all, so no script here can request SQUIRE pages, and no sitemap, feed or API was found or used.
- The only working discovery route is search-engine results that point at individual barber pages, followed by one page read per barber.

## Why throughput is low

- Each verified barber costs one page read; each search returns roughly 5–15 barber URLs.
- Many SQUIRE barbers show only a first name ("Sam", "Mike", "Alyssa") or a surname initial ("Will B.", "Jay F."). Columbus's indexed barbers were all initial-only, so 0 qualified. These are rejected by rule, never completed by guessing.
- Duplicates rise as metros overlap (8 of 39 in b03).

At ~35–40 verified barbers per batch, 5,000 would take on the order of 120+ batches by this route.

## Continuous discovery (Phase 9)

Not deployed. An automated crawler is not possible within the rules: the directory is JavaScript-rendered, this environment cannot reach SQUIRE, and running a crawler from GoBookr's own servers would be a new production crawler against SQUIRE that needs your decision. The compliant alternative in place is the resumable batch workflow below, plus a proposed weekly link check of already-imported booking URLs (not built yet).

## Resumable workflow

1. Search `getsquire.com barbershop {city} barber`; keep only `/barber/` URLs whose slug has a full first and last name.
2. Read each page and append to `pages.jsonl` (checkpoint; never re-read a URL already there).
3. `node scripts/squire-national-pipeline.js data/source-audits/squire-wave2/bNN-pages.json --batch=bNN`.
4. Run the read-only duplicate check, then `bNN-insert.sql`; verify totals, redirects and search.
5. `node scripts/squire-inventory.js data/source-audits/squire-wave2 --imported=<prod url list>` to refresh `inventory.csv`.

## Open items

- Shop coordinates migration (`db/migrations/20260922_shop_coordinates.sql`) still awaits approval.
- Two earlier rows store the barber's own name as the workplace (Andy Alvarez, Michael Martin) because the page printed it that way. The new `shop_name_is_barber_name` rule would now flag them; they were left unchanged.

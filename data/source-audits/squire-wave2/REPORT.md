# SQUIRE nationwide import — wave 2 status (2026-11-18)

Status: **target not reached.** Production holds 350 SQUIRE profiles against a goal of 1,000.

## Metrics

| Measure | Value |
|---|---|
| Starting SQUIRE profiles | 253 |
| Individual barber pages read first-party (discovered) | 108 |
| Passed validation | 105 |
| Imported to production | 97 (ids 16706–16802) |
| Rejected as duplicates of existing profiles | 8 (6 Denver, 2 Chicago) |
| Rejected as unverifiable / incomplete | 3 |
| Total SQUIRE profiles now | 350 |
| States with SQUIRE profiles | 14 |
| Cities with SQUIRE profiles | 41 |
| Imported rows with an individual barber booking URL | 97 of 97 |

Rejections: `Javier(erick) Martínez` (nonstandard display name), `Kendriz Guaba` (no services listed), `Germs Del rio` (malformed address line).

## Batches

| Batch | Metros | Pages | Imported | Production ids |
|---|---|---|---|---|
| b01 | Atlanta, Houston, Dallas, LA, Miami, Philadelphia, Phoenix | 40 | 39 | 16706–16744 |
| b02 | Seattle, Boston, San Francisco, San Diego, Charlotte | 29 | 27 | 16745–16771 |
| b03 | Nashville, Denver, Austin, Las Vegas, Tampa, Chicago | 39 | 31 | 16772–16802 |

## Verification per batch

- Read-only duplicate check before insert (same booking URL, or same name + city + state).
- Insert guarded by NOT EXISTS on both keys; `user_id = NULL`, `claim_status = 'unclaimed'`; no existing row updated.
- Post-insert: every new row has an individual `/barber/` URL, a street with a number, and a 5-digit ZIP; 0 duplicate individual URLs in the table.
- `/book/{id}` on production returns 302 to the barber's SQUIRE page for the first and last id of each batch. This confirms the link only, not real-time availability.

## Blocker

SQUIRE exposes no feed or bulk listing that can be read legitimately. Shop pages render barbers with JavaScript and give no links, and city pages list shops, not barbers. The only usable discovery route is search-engine results that point at individual barber pages, followed by one page read per barber. That yields about 30–40 verified barbers per batch of ~45 requests. Duplicates rise as metros overlap earlier imports (8 of 39 in b03). Many SQUIRE barbers also show only a first name or a surname initial, and those are rejected by rule.

Reaching 1,000 would take roughly 18–20 more batches by this route. No access controls were bypassed and no profile was inferred or invented.

## Not done / needs approval

- Shop coordinates migration (`db/migrations/20260922_shop_coordinates.sql`): still not applied.
- Workplace shown as the barber's own name on two pages (Andy Alvarez, Michael Martin): imported as the page prints it.

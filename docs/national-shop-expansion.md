# National shop expansion — runbook

Colorado (`docs/colorado-shop-directory-20261119.md`) is the reference implementation. The same rules now run for every state.

## Pipeline

| Step | Code | Writes to production? |
|---|---|---|
| 1. Discover | `scripts/crawl-state-shops.js --state=XX` | No |
| 2. Check websites | `scripts/check-shop-websites.js` | No |
| 3. Plan import (match, dedupe, hold) | `scripts/import-state-shops.js --state=XX` | No; writes guarded `batch-NN.sql` |
| 4. Coverage audit | `scripts/shop-coverage.js` (Census 2020 places + counties) | No |
| 5. Record status | `scripts/expansion-status-sql.js` → `shop_expansion_states` | Dashboard table only |
| 6. Import | run `batch-NN.sql` in order | Yes; requires approval per wave |
| 7. Verify live | `/shop/:id`, category + city search, mobile | No |

The `National Golden List — 50-state shop discovery` workflow runs steps 1–4 for every state each Tuesday, three states at a time. It commits results to the `data/national-shop-discovery` branch under `runs/<ST>/latest` and keeps dated history in `runs/<ST>/<date>`. You can also run it on demand for one wave or a list of states.

## Sources

| Source | States | Notes |
|---|---|---|
| State shop-license open data (Socrata) | CO (DORA `7s5z-vewr`), TX (TDLR `7358-krk7`), NY (DOS `y3u4-jbgh`), CT (DCP `ngch-56tr`) | Business licenses only. Individual practitioners, schools and booth/area renters are excluded, and inactive or expired rows are dropped. |
| OpenStreetMap via Overpass | all 50 | Four smaller queries per state. A failed part makes the source `partial`; it is never silently dropped. ODbL attribution applies. |
| U.S. Census Geocoder | all 50 | Fills a missing city only when the map point lies inside an incorporated or census-designated place. |
| Census 2020 place/county files | all 50 | Coverage denominators. |

Not yet used: city/chamber directories, salon-suite locators (Sola, Phenix, MY SALON Suite, Salons by JC), and booking platforms (Square, Booksy, Vagaro, GlossGenius, SQUIRE, Boulevard, Mangomint, Zenoti, Booker). Each needs its own adapter. Each must respect robots.txt and the platform's terms, with no login, block or rate-limit circumvention. Their listings are mostly individual professionals rather than shop locations, so they must not be counted as new businesses.

States other than CO, TX, NY and CT have no open bulk shop-license dataset. For those, adding licensing-board data needs either a published bulk file or a records request; scraping lookup pages is not allowed.

## Publishing rules

- **Licensed row:** an active business license, plus a name, a city that is a place name, a ZIP, and category evidence. The evidence can be a service named in the business name, or a specialty license type such as "Eyelash Extension Establishment".
- **Map-only row:** a city plus a category (from the map tag or the name), plus a website that loaded during this run's check.
- **Everything else is held**, with a reason: no category, missing city or ZIP, school, private facility, no website, website not live, or conflicting websites.
- **Websites and phones** come only from the source that stated them. Websites are attached only if they loaded.
- **Everything is unclaimed:** `owner_user_id = NULL`, `claim_status = 'unclaimed'`, no staff, no booking URL.
- **Idempotent batches:** `NOT EXISTS` on `source_external_id`, on `license_number`, and on name + city + ZIP within the state. Rerunning a state inserts nothing new.
- **No automatic deletion.** A failing website is reported, never used to remove a shop.

## Dashboard

`/admin/shop-expansion` shows all 50 states, with per-state city, category, source and review drill-downs.

- **Live from `shops`:** published, with website, missing website, claimed, and cities.
- **From the latest recorded run:** candidates, verified unique, held, sources, coverage, and errors.
- **Statuses:** Discovery → Importing → Verification → Live → Maintenance. A new discovery run never lowers a state's status.

Census coverage figures are computed from the run's publishable rows. Before a state is imported they show eligible coverage, not live coverage.

# Nearby search and imported listings

Verified imports do not require coordinates. Missing coordinates must not block inventory growth or be replaced with a guessed city-center location.

- The first result group contains only coordinate-backed matches inside the selected radius. Manual city and ZIP searches measure from the city/ZIP center, stated on the page; GPS searches use the supplied location.
- A separate group contains listings without coordinates in the exact requested city/state or ZIP/state. It preserves category, specialty, public-readiness, and professional/business filters. Every card says **Distance unavailable** and the group warns that listings may be outside the radius.
- GPS-only searches do not infer a city from arbitrary coordinates or reuse a stale city field for this group.
- If a map center cannot be resolved, location-text results remain available and the page explicitly says the distance filter was not applied. Ambiguous city names should be searched with a state or ZIP.
- Candidate queries are capped independently: 200 radius professionals and 50 city-only professionals, 100 radius businesses and 50 city-only businesses. Professionals are hydrated once in bulk. The header counts only radius-confirmed matches when a radius is active; the secondary group reports its own displayed count.

## Coordinate enrichment

Enrichment stays outside customer requests. The existing `npm run backfill:coordinates` script uses Census address geocoding; it needs a reviewed production connection and a separate operational run. This search release does not run that script, change profile coordinates, or alter importer cadence. Do not use city/ZIP centroids as professional coordinates. Validate address matches before updating production, and preserve existing coordinates and ownership.

## Verification

`tests/nearby-search-postgres.test.js` exercises real Postgres predicates in an isolated PGlite database, including distance exclusion, city/state and ZIP scoping, missing/partial coordinates, category/specialty filters, public readiness, businesses, GPS, ambiguous centers, injection-like input, independent result caps, and the absence of request-time geocoding/database writes.

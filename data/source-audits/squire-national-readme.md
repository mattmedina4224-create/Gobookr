# SQUIRE national public-professional source audit — 2026-11-18

**Goal:** Expand GoBookr's SQUIRE barber inventory nationwide while avoiding guessed names and false booking links.

## Verified first expansion
- Source: publicly indexed first-party SQUIRE professional booking pages under `https://getsquire.com/discover/barbershop/{shop-slug}/barber/{barber-slug}` and the parent city discovery pages.
- Geographic expansion: New York, NY (including Queens/Long Island City), Austin, TX and Chicago, IL.
- **31 net-new unclaimed public profiles published**, IDs **16675–16705**, with the `barber` category and exact individual SQUIRE professional page as booking URL.
- All 31 professional pages were supported by indexed SQUIRE content with names, shop names, physical addresses and haircut/related service menus; 31 distinct barber URLs and 0 matches against existing GoBookr profiles by booking URL or normalized name+city.
- 31/31 GoBookr profile routes returned HTTP 200. 31/31 GoBookr `/book/{id}` routes returned HTTP 302 to the exact SQUIRE barber URLs. These redirect checks **do not confirm a real-time available appointment**.
- Existing SQUIRE profile count before this wave: **222** in production (115 distinct first-party source URLs), mostly in Colorado. With these 31, production should contain **253** source_name='SQUIRE' profiles; independently query production before citing a current count.
- Source records are preserved in `data/source-audits/squire-national-first-party-profiles-20261118.json` (first 24) and `data/source-audits/squire-national-additional-profiles-20261118.json` (next 7).

## Discovery and limitations
SQUIRE provides discoverable city pages such as:
- https://getsquire.com/discover/united-states/new-york/new-york/barbers
- https://getsquire.com/discover/united-states/texas/austin/barbers
- https://getsquire.com/discover/united-states/illinois/chicago/barbers

Indexed city pages currently show roughly 100+ barber results each, but many entries show **only first names or initials**, and some individual profile pages in the search index are stale/return HTTP 410. Use live first-party indexed individual pages to confirm the full name, full physical location and haircut services before public import.

**Technical blocker:** Direct requests to SQUIRE's individual and shop `/discover/` pages from the Vercel sandbox returned HTTP 403. Do not bypass access controls or claim this is a reliable high-volume crawler. The official `/sitemap.xml` returned a marketing sitemap index pointing to `/sitemap-website.xml`, not an established exhaustive public barber sitemap. Any nationwide bulk discovery needs a supported export/feed or other authorized, accessible first-party index.

Never infer a full surname from initials or a URL slug alone. Reject first-name-only profiles, mobile-only records without a stable service area when geographic search requires an address, incomplete addresses, deleted links or exact-identity duplicates. Never modify claimed records during imports.

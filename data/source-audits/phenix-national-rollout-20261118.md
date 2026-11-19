# Phenix Salon Suites national importer — staged rollout

**Scope:** 432 U.S. locations on the official Phenix network listing (as checked November 18, 2026). No claim that every tenant is bookable or suitable for GoBookr.

## Baseline
- Production currently has **106 profiles with Phenix in their source name**, all in Arizona.
- The existing 2026-11-17 Arizona audit prepared 97 candidates from eight regional directories, and production imported 95 after deduplicating booking destinations. Other Arizona additions came from the first-party `phenixsalonaz.com` directory.
- **No new national Phenix profiles are claimed as imported by this branch.**

## Permitted source discovery
1. Work with publicly available first-party Phenix location/professional directories, site-owner authorized exports, or partner feeds.
2. Respect access controls, robots.txt, rate limits, and 403 blocks. The national `phenixsalonsuites.com` site returns 403 to automated browsing from the current execution environment. Do not circumvent.
3. Capture explicit individual name, category/service, location, suite where present, source URL, and first-party outward booking URL. Never invent a booking path or infer an appointment slot.
4. Prefer the official national location inventory as discovery; deduplicate overlapping regional sites and national listings.
5. No copied photos, bios, testimonials, phone numbers, or ratings.

## Prepare existing verified archive

```sh
node scripts/prepare-phenix-import.js data/source-audits/phenix-arizona-source-part-1.json tmp/phenix-az-part1.json --state=AZ
node scripts/import-unclaimed-profiles.js tmp/phenix-az-part1.json --state=AZ --dry-run --report=tmp/phenix-az-part1-dry.json
```

**Important:** source archive is historical. Reverify the individual professional listing and outward booking link before any live import. Recheck existing identities in all booking platforms, not solely Phenix-attributed profiles. If a source has disappeared, skip it.

## National rollout process
1. Enumerate all official states/locations from an authorized inventory.
2. Store sources with location ID and inspection status (reachable / blocked / missing directory / reviewed).
3. For each permitted location directory, extract only current named professionals and original outbound booking URLs.
4. Normalize to the preparation tool's object schema; each object must include `state`, `name`, `city`, `source_url`, `booking_url`, and `category` or `categories` / `category_bits`.
5. Run preparation, link verification, cross-platform identity dedupe, and importer dry-run.
6. Import only sufficiently verified unclaimed profiles; never create user accounts or overwrite claimed profiles.
7. Verify the profile card and external booking redirect in GoBookr production; save per-location totals and rejects.
8. Report real counts separately for discovered locations, directory profiles, verified bookable candidates, duplicates, and new live profiles.

## Category and booking restrictions
- Generic importer now permits a **Phenix first-party source URL** only when an outward booking link is on an explicitly allowed provider host.
- Allowed extra providers for Phenix only: Gina's Platform, StyleSeat, Acuity `as.me`, Goldie, and Noterro.
- For other sources, existing registry remains the authoritative booking host allowlist.
- `pro_categories` remains authoritative, and `pro_profiles.category` may use a legacy fallback. Check before scale-out.

## Verification still required
- Run `node --check scripts/prepare-phenix-import.js` and `node --check scripts/import-unclaimed-profiles.js`.
- Run the existing suite (`npm test`) in CI.
- Dry-run the archived Arizona candidate against a production-equivalent DB to ensure zero duplicate imports.
- Independently confirm allowed hosts and redirect behavior. National source access may require Phenix authorization or a partner feed.

**The 432-location figure is an inventory target, not proof that 432 locations have been crawled or imported.**

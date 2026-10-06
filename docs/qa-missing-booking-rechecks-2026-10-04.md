# Missing booking links: read-only rechecks — October 4, 2026

## Outcome and scope

Fourteen existing, unclaimed Sola-sourced listings triaged. Two GlossGenius booking-link candidates found; two contact-only listings corroborated; two partial/ambiguous provider leads held; eight unresolved. This is not fourteen fully reverified records. Full mobile/desktop booking acceptance and complete identity verification remain open.

Production inserts, updates, deletes, merges and imports: **0**. No appointments, contact forms or billing submitted. Existing source attribution, names, addresses and license flags remain unchanged.

Read-only production count at **2026-10-04 23:09:30.788421+00**: **501 total records, 500 visible by the application's listing/subscription rules, 185 visible records with empty booking URLs**. The visible count is not a certified count of legitimate, freshly verified, bookable professionals; that count and its gap to 500 remain unknown.

## Per-listing evidence

| ID | Stored name | Disposition | Opened primary evidence / remaining issue |
| --- | --- | --- | --- |
| 117 | Ashley Melissa Salon | Booking repair candidate | [GlossGenius about](https://ashleymelissa.glossgenius.com/about) identifies salon, hair services and 2700 E. Second Ave., Suite 10, Denver CO 80206. Book Now redirects to [services](https://ashleymelissa.glossgenius.com/services), retrieved today with service-selection controls. Suite 10 also appears on Lexi's contact page; possible stale/shared suite, not proven duplicate. |
| 118 | Ashley Smith | Unresolved | No matching current primary personal booking page independently opened. Do not substitute another Ashley. |
| 119 | Hair Bar | Unresolved | Sola location address alone does not verify this specific business or booking destination. |
| 120 | Obst Design | Unresolved | Search leads insufficient; no current primary matching booking page opened. Do not use similarly named out-of-state businesses. |
| 121 | Hair by Natalia | Contact-only corroboration | [Appointments](https://www.hairbynatalia.com/appointments/) and [about](https://www.hairbynatalia.com/about-natalia/) show stylist/services and 2700 East 2nd Ave., Studio 24, Denver CO 80206. Appointments instruct texting; no confirmed online scheduler. Do not label a homepage as online booking. |
| 122 | James Studio | Unresolved | Sola search snippet names James Kavanagh/Studio 37. Opened location extract does not independently expose that roster or a scheduler. No rename. |
| 123 | Busy Bee Salon | Unresolved | Sola snippet names Kailey Ramer/Studio 27. No opened current personal booking page. |
| 124 | Lexi Elizabeth Hair Artistry | Contact-only corroboration | [Contact](https://www.lexielizabethhairartistry.com/contact) shows text/call and 2700 E. 2nd Ave., Suite 10, Denver 80206. [Sola personal page](https://book.solasalonstudios.com/lexi-elizabeth-hair-artistry/pro) names Lexi Spiess but retrieved page has blank location/services and malformed Book Now host `www.`. Not a verified working scheduler. Suite overlap with 117 held for review. |
| 127 | Lashes by Alice | Ambiguous identity; hold | [Fresha listing](https://www.fresha.com/it/a/lashes-by-alice-lakewood-1370-colorado-mills-parkway-sd6zgsx5) shows Lakewood street and lash services but no ZIP in retrieved text. Sola snippet names Alice Nguyen, while [Image Studios Arvada](https://www.imagestudiosarvada.com/beauty-professionals) names Alice Huynh with same brand. Do not infer these are the same person, relocate the listing or adopt link without resolution. |
| 130 | Lash Out Loud | Booking repair candidate | [GlossGenius about](https://lashoutloudbeauty.glossgenius.com/about), freshly retrieved, identifies Lash Out Loud Beauty Co., Charlene Janke and 1370 Colorado Mills Pkwy, 14, Lakewood CO 80401. [Services](https://lashoutloudbeauty.glossgenius.com/services) shows lashes/brows/waxing and selection controls. Keep business-brand display; self-described license is not independent license verification. |
| 134 | Elizabeth Rose Hair and Brows | Unresolved | DTC Sola snippet names brand/Studio 3; no opened current personal scheduler. |
| 137 | Aspire Nail Care Studio | Partial provider lead; hold | [Own site](https://www.aspirenailcare.com/) retrieval returned InternalError; not evidence business is closed. [Fresha venue](https://www.fresha.com/a/aspire-nail-care-studio-greenwood-village-6001-south-willow-drive-bum8qpt8) shows name, nail services and 6001 South Willow Drive #175 Studio 1, Greenwood Village; ZIP not displayed. Book Now opens its all-offer route. Provider-policy review and complete identity/mobile/desktop checks required before adopting. |
| 161 | NAILS BY Christina | Unresolved | Search/registry leads do not establish current personal booking destination. |
| 162 | JP Nails and Lashes | Unresolved | Sola snippet names Jessica Pang/Studio 4. No opened matching personal scheduler. |

Opened shared source pages:
- [Cherry Creek Clayton Lane](https://www.solasalonstudios.com/locations/cherry-creek-clayton-lane): 2700 E. 2nd Ave., Denver CO 80206.
- [Denver West](https://www.solasalonstudios.com/locations/denver-west): 1370 Colorado Mills Pkwy, Lakewood CO 80401.
- [Denver Tech Center](https://www.solasalonstudios.com/locations/denver-tech-center): 6001 S. Willow Dr., Greenwood Village CO 80111.

Their opened extracts primarily show leasing/location information, not a full current professional roster. Search snippets are leads, not page-opened row certification. Provider retrievals may use cached snapshots; about/menu availability does not establish a completed booking.

## Narrow dry-run proposal — NOT approved or executed

| ID | Field | Current | Proposed |
| --- | --- | --- | --- |
| 117 | booking_url | Empty string | https://ashleymelissa.glossgenius.com/services |
| 130 | booking_url | Empty string | https://lashoutloudbeauty.glossgenius.com/services |

If eventually accepted: **2 field updates, 0 inserts/deletes/merges, no name/address/source/license changes**. Listing count unchanged. Missing-link count would move 185 → 183 only if both still satisfy preconditions and both updates succeed; this has not happened.

Preconditions:
1. Resolve 117/124 Suite 10 overlap without assuming closure or duplicate identity.
2. Complete identity review and mobile + desktop destination acceptance. Do not submit an appointment.
3. Recheck exact target IDs, unchanged empty URL, null user_id and unclaimed status immediately before any write.
4. Preserve existing source_url/source_name attribution and record new booking destination evidence separately.
5. Show the final bounded dry run and obtain explicit owner approval before production updates.
6. Repeat duplicate checks immediately before the approved write; no automated merge based solely on shared business/team booking URL.

Read-only duplicate candidate query returned only IDs117 and130, both with empty URLs:
- Any existing booking_url containing ashleymelissa.glossgenius.com or lashoutloudbeauty.glossgenius.com;
- Or normalized trim/lower business_name in Ashley Melissa Salon / Lash Out Loud / Lash Out Loud Beauty Co with ZIP80206/80401.
No populated destination match appeared. This limited check does not prove every alternate spelling, personal-name identity or normalized name + workplace + ZIP is unique. Earlier full normalized grouping found zero duplicate tuples; rerun exact tuple validation for any approved import/write.

This proposal is additional to the previously documented 478/496 replacement leads, which remain separately held. It does not approve the old 12-row clearing proposal or authorize any production write.

## Running log / next acceptance gates

- Inventory: in progress, not certified. 14 triaged / 2 candidates / 0 fully reverified to launch acceptance / 0 imported / 0 edited.
- No CSV candidate rejects recorded: attached batch files remain unavailable; unresolved existing records are review flags, not fabricated import rejects.
- PR135 remains open. Latest application correction cf5e059 passed checks run769; READY deployment dpl_E1PKeP6LTUjKBhjd45DApBvS2zBR. Preview browser navigation redirects to Vercel login; actual mobile/desktop acceptance of latest code remains blocked.
- This report changes documentation only. No new functionality or styling shipped.
- Continue unresolved primary-page research; resolve identity/address holds; obtain preview access and safe authenticated/test-mode acceptance. No workstream is newly certified complete.

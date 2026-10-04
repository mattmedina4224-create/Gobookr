# GoBookr launch QA — 2026-10-04

## Baseline
- Production READY: e796c08aaacbcd84d87c92a673c689dc7aae83fc, deployment dpl_6Fn7VvNgHi7Em67FWuuKpGkBwcnw.
- Baseline application suite: 212 pass, 0 fail, 0 skipped with PGlite Postgres checks enabled.
- Isolated preview database: rpjxaaeqcqjjbjoddnke, four real profiles, zero users/admins at audit.
- PR127 remains open. Its preview pricing route now returns HTTP200; old missing-DATABASE_URL blocker is resolved.

## Inventory: read-only audit
- 501 total records; 500 source-attributed profiles satisfy current listing visibility rules.
- 185 visible profiles have no booking URL. 101 have generic Booksy category/city search URLs.
- 315 populated URLs, 222 unique exact URLs. Populated does not mean verified working or personal.
- Normalized lower-case/whitespace name + workplace + ZIP grouping: zero duplicates.
- Lower-case/trailing-slash booking grouping: 30 groups; shared team links are flags, not proof of duplicate people.
- Source check timestamps exist on all 500 visible listings. Current accuracy of every source remains unverified. The exact count of independently reverified legitimate listings is not established; do not call the target certified.
- Full 286-row missing/generic-link flag list: qa-inventory-flags-2026-10-04.json.
- CSV and merge script absent from scratch and exact/stem file searches. Zero candidate rows imported/rejected from that batch today.
- Production insert/update/delete/merge operations today: zero. Removed rows: none.

## Reproduced bugs / proposed fixes
- Live search shows 1 mi with no radius applied; prepared Any distance selection.
- Live Terms contains $15 while the plan is $20; prepared correction and pricing page.
- Generic Booksy directory URLs are presented as individual booking links; prepared suppression and safe redirect guard without altering stored data.
- License badges rely only on a flag; prepared requirement for flag plus license number/state and removal of blanket homepage verified claim.
- Business staff can include non-public profiles; prepared bounded visibility hydration and safe image URLs.
- Marketing scheduled/Live labels are ambiguous; prepared explicit manual-post and Live on GoBookr labels.
- Preview-only public-page 390px/1024px frame enables layout tests. Production remains frame-denied; harness excludes dashboards, external URLs and private routes.

## Browser evidence so far
- Desktop homepage -> select Massage Therapists + Fort Collins -> two real profiles.
- Sheila profile -> Book Appointment -> https://zentherapies.glossgenius.com/services; name, 333 W Drake Road Suite23 Fort Collins80525 and selectable services observed. No appointment submitted.
- Desktop and mobile complete walkthrough, authenticated claims, editing, uploads, marketing and two-tap dashboard navigation are not yet certified.

## Blockers
- Stripe connector exposes only GoBookr livemode=true. No live account operation, live key, card or charge used. Need GoBookr test-mode/sandbox access for provider lifecycle tests.
- Inventory batch files unavailable. Need requested CSV/script to complete that batch audit.
- Preview has no authenticated QA account/admin. Need secure test-account sign-in for browser claim/admin/edit and dashboard verification; isolated route/Postgres tests are separate evidence.
- Every external booking page and source has not yet been opened/reverified; 286 definite booking-data flags require source research and approved dry-run changes.
- Automatic social publishing is unconnected/unverified; only manual workflow can be claimed.
- No rendered demo video or external schema-tool validation yet.

No whole workstream is marked Verified at this audit stage. This log is updated as evidence arrives.

## Additional verified evidence
- PR135: https://github.com/mattmedina4224-create/Gobookr/pull/135. Changes remain unmerged pending final preview/authenticated verification.
- Local suite after mobile claim regression: 222 pass, 0 fail, 0 skipped. These include isolated Postgres claim transactions and mocked billing contracts; they do not certify Stripe provider behavior.
- Mobile public harness outer width390 (content width375 due scrollbar): location-denied warning appeared; manual Fort Collins massage search returned two real profiles; Any distance selected; document scrollWidth375 equals clientWidth375.
- Mobile claim entry for profile522 rendered Create an account to claim and Log in actions. Signup submission/admin approval still blocked by missing QA credentials.
- Mobile profile action column omitted Claim this profile. Added an unclaimed-only mobile claim action and regression coverage; final deployed browser retest still required.
- Static public/sitemap.xml shadowed dynamic sitemap with only five URLs. Removed static shadow and added regression coverage; final deployed fetch still required.
- Production pro_events read-only query confirmed test profile_view at 2026-10-04 17:08:16.796982+00 and booking_click at 17:08:22.322787+00 for profile522. Visit/search event tracking is not implemented or verified.
- Screenshots captured for mobile search and claim entry. Whole workstreams remain uncertified.

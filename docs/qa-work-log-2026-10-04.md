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
- Final code commit4888ccbdee047dd85e7c0c97c97a8eaf1880bb9b: GitHub GoBookr checks run761 completed success; Vercel dpl_3HY3qXRkCCiu7KUroqZj3dkUgypL READY, https://gobookr-5pm411c9a-mattmedina4224-7308s-projects.vercel.app.
- Final preview mobile profile522 visibly includes Claim this profile; clicking it opens correct claim522 page. Desktop profile1024 also exposes claim action and correct claim entry. Screenshots linked in PR evidence.
- Final preview /pricing and /terms HTTP200, contain $20 and no $15. /sitemap.xml HTTP200 with nine URLs (four real profiles, three populated discovery combinations, home/openings).
- Syntax check119 JavaScript files passed. Default npm test passes220 with2 optional Postgres checks skipped; full optional-Postgres-enabled run is reported separately.
- Remaining full browser acceptance gates: secure QA signup/admin access; Stripe sandbox connection; marketing uploads/download/scheduling; dashboard two-tap test; complete booking/source verification; visits/search analytics and schema-tool validation. No whole workstream is launch-certified.

## Workstream status at verification gate
| Workstream | Status | Evidence | Next step |
|---|---|---|---|
| 4 Inventory | Blocked | 500 visible;185 missing links;101 generic links;zero identity duplicate groups;30 shared URL groups | Restore candidate CSV/script; open sources; dry-run any production corrections for approval |
| 1 Walkthrough | In progress | Desktop city/category search, one external booking page;mobile denied-location/manual search and profile/claim | Check all links and remaining mobile/desktop states |
| 2 Claims | Blocked | Isolated Postgres lifecycle tests;mobile/desktop profile-to-claim-to-signup entry | Secure isolated test user/admin;complete browser lifecycle |
| 3 Accounts/billing | Blocked | Mocked billing contracts;only connector account livemode=true | Connect Stripe sandbox;test provider lifecycle and access |
| 5 Profile polish | In progress | Visibility/license safeguards and regression tests;public profile rendered | Test real uploaded banner/staff/license cases on both sizes |
| 9 Pro app | Blocked | Dashboard tests/code reviewed | Authenticated mobile two-tap navigation test |
| 7 Analytics/SEO | In progress | Profile-view/booking-click DB events;preview dynamic sitemap/pricing fetch | Implement/verify visits/search;schema-tool validation and all discovery metadata |
| 6 Marketing | Blocked | Manual scheduling/download wording prepared;automated posting unconnected | Authenticated upload/download/schedule test;verify integration or manual workflow |
| 8 Launch materials | In progress | Draft demo script/storyboard and onboarding/claim/FAQ docs in PR | Match drafts to certified authenticated flows |

## Final local validation command
GOBOOKR_PGLITE_MODULE=/workspace/scratch/312e5c50000f/Gobookr-design/node_modules/@electric-sql/pglite npm test
Result: tests222;pass222;fail0;cancelled0;skipped0;duration5936.253546ms.
Syntax: node scripts/check.js;119 files checked;exit0.

## Release decision
No merge today. PR135 is mergeable and application-head checks green, but authenticated browser acceptance and remaining changed-flow mobile/desktop tests are incomplete. No production data writes or live billing operations. Screenshots attached under docs/qa-screenshots/2026-10-04.

## Public follow-up push
- Seven additional stored source/booking URLs opened; three personal-name listings corroborated, three brand-name listings need individual-vs-business review, one failed destination. Details: qa-source-rechecks-2026-10-04.md. No live records modified. Directory-wide legitimacy count remains unknown.
- DE-PEACE WELLNESS profile423 Booksy URL redirects to a generic directory with do=showBusinessDeletedModal. Needs a verified replacement or approved hold; not certified working.
- External Schema.org validator browser navigation timed out: `timed out awaiting tools/call after 300s`. Not retried; external validator is NOT passed. Added a local vocabulary checker with explicitly limited scope, using the current official Schema.org JSON-LD vocabulary.
- Removed invalid aggregateRating from Person metadata; visible reviews unchanged. Added CollectionPage/ItemList metadata for populated discovery pages; empty pages omit schema and remain noindex. No made-up business/person identities in collection list metadata.
- Added cookie-free visit/search request events to structured runtime logs, including actual result_count. No private query text, location coordinates, identity, cookies or referrers logged. DNT/GPC, prefetch, obvious bots, private routes and non-200/non-HTML responses excluded. Preview events labelled preview. These are not unique visitors or a durable analytics warehouse.
- New analytics dependency initially broke strict VM test harness allowlists. Updated those dependency stubs and reran:227 pass,0 fail,0 skip; discovery schema render test then also passed. Final all-test run/deployed-event evidence follows.
- No new schema migration, production data operation, billing operation, secret or authentication-provider change made in this push.
- Application commit0a87617776da7600ab5d0d0daffd970a2a806f57: checks run763 success; Vercel dpl_3cPxP7cBgdks5EhngFKGQ93UK7sv READY. Actual preview runtime logs show homepage visit and Fort Collins massage search with result_count2. Local schema tool checked extracted deployed JSON-LD:profile522 zero errors; populated discovery zero errors. External validator remains blocked, not passed.
- Final isolated suite:231 pass,0 fail,0 skip; syntax127 JavaScript files,exit0. Full evidence:qa-public-evidence-2026-10-04.md.
- Read-only HTTP booking audit covered500 rows/222 unique populated URLs:198 reachable-unverified,185 missing,101 generic,12 deleted-business redirects,3 HTTP502 and1 timeout. Counts are profile rows. Full report and input saved with auditor/tests. No production edits and no claim that HTTP200 certifies correct identity or working booking flow.
- Latest application commit still lacks mobile/desktop browser acceptance. PR135 remains unmerged; production unchanged. Authenticated signup/admin, Stripe sandbox, candidate files, marketing flow and pro dashboard gates remain open. No whole workstream newly certified.

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

## Continued public push
- Evidence commit e0650f2a0c188363259eec8af3e8e4c101cb1bf5: GitHub checks run764 completed success; Vercel dpl_Gv44q2mhGrYUaB3P4V7Y2H6hWsAC READY. No application change from previously verified runtime events.
- Browser access to that preview redirects to Vercel login: current browser session expired. No deployment-protection setting, credential or permission changed. Fresh preview mobile/desktop acceptance remains blocked on sign-in, not a claim that the site is down.
- Live production desktop: actual Service selection + Fort Collins + Search returns2 results; opening Sheila522 yields correct name/workplace, Book Appointment and Claim this profile; claim entry shows correct522 signup/login actions. Viewport1363px and scrollWidth1363px on claim page, no horizontal overflow. No account signup/claim submission or booking submitted. This is production desktop evidence, NOT latest-preview/mobile certification.
- First read-only target query used nonexistent table `pros` and returned42P01. Inspected repository table/field definitions, corrected to pro_profiles/business_name/zip_code; one bounded SELECT succeeded for16 review IDs. No data mutation.
- Prepared explicit12-row booking repair dry-run proposal with preserved before-values and approval gate;0 changes executed. Ambiguous502/timeout records excluded. Three replacement searches did not establish fully approved replacements; details in qa-booking-repair-proposal-2026-10-04.md.
- Added30-second public-only demo script and Mac recording/export steps. Authenticated dashboard/billing shots excluded. No video rendered or mobile footage certified.

| Workstream | Status | Current evidence | Next step |
|---|---|---|---|
|4 Inventory|Blocked|500 visible rows;500-row HTTP audit;7 source rechecks;12-row repair proposal|Candidate files, source identity research, approval before any bulk correction|
|1 Walkthrough|In progress|Live desktop search/profile/claim;earlier preview mobile denied-location/search;HTTP link audit|Restore preview browser sign-in;mobile+desktop changed flows and provider destinations|
|2 Claims|Blocked|Isolated transaction tests and public claim entry|Secure QA account/admin;submit/approve/edit/reject/duplicate browser tests|
|3 Billing|Blocked|Mocked contracts;only live connector available|Stripe test sandbox;provider lifecycle/access tests|
|5 Profile polish|In progress|Visibility/license safeguards and public profile render|Real banner/staff/verified-license mobile+desktop cases|
|9 Pro app|Blocked|Dashboard code/tests inspected|Authenticated two-tap mobile test|
|7 Analytics/SEO|In progress|Actual visit/search preview logs;DB profile/booking events;local schema checks;sitemap|Durable analytics,external validator,full metadata/discovery coverage|
|6 Marketing|Blocked|Manual-post labels/tests;no connected auto-publishing claim|Authenticated upload/download/schedule verification|
|8 Launch materials|In progress|Guides plus60–75s and30s demo scripts/recording steps|Certified pro-flow guides and recorded/playable video|

## Owner-supplied replacement research review
- Independently opened Divine Queen’s Touch candidate1460320; matches stored478 name/address/ZIP, but stored URL uses1778499. Different destination, not old-URL recovery. Retrieved snapshot is cached; current mobile/desktop booking flow still unverified. Residential/mobile sensitivity flagged; no identity rename or review import.
- Radiant Roots /book redirects to /services; business/service menu corroborated. Primary extracted about page lacks street/ZIP; full-row verification still pending. Team/brand identity not silently converted to a person.
- Read-only exact replacement booking/source lookup returned0 existing matches. Both current records unclaimed,user_id NULL. No production edits. Original12-row clearing proposal explicitly superseded for478/496; neither should be blindly cleared while replacements are under review. Remaining10 still have no approved replacements.
- Owner-supplied research and independent findings documented in qa-replacement-review-2026-10-04.md. No whole workstream certified by these findings.

## Rendered launch demo follow-up
- Delivered30-second captioned MP4 from four actual production desktop screenshots:homepage,Fort Collins massage results,Sheila522 profile,claim entry. Clearly labelled still captures; no fabricated UI/activity or untested dashboard/billing footage.
- H.264/yuv420p,AAC silent audio,faststart,1280×820;ffprobe duration30.000000;full decode exit0;four representative frames visually checked. Actual phone playback not tested. Recipe/evidence in launch-demo-video.md and scripts/render-public-demo.py.
- Production search shows oversized empty claim-link panels below results; observed visual bug, not fixed/certified in this follow-up. Video crops show actual profile cards without claiming whole-page visual readiness.
- No application changes,production writes,billing operations or merge. Preview sign-in,isolated auth lifecycle,Stripe sandbox and missing candidate CSV/script remain blockers.

|Workstream|Status|Current evidence|Next step|
|---|---|---|---|
|4 Inventory|Blocked|500 visible rows,500-row HTTP audit,source rechecks,replacement review|Missing candidate files;identity re-verification;approved dry-run before bulk edits|
|1 Walkthrough|In progress|Desktop public search/profile/claim navigation captured;earlier mobile evidence|Fresh preview mobile+desktop acceptance;booking destinations;claim-panel visual bug|
|2 Claims|Blocked|Isolated lifecycle tests and public entry|Authenticated signup/approval/rejection/edit lifecycle|
|3 Billing|Blocked|Mock tests;connector only live mode|Stripe sandbox provider/access lifecycle|
|5 Profile polish|In progress|Safeguards and public profile rendering|Banner/staff/license-state cases at both widths|
|9 Pro app|Blocked|Code/tests reviewed|Authenticated mobile ≤2-tap acceptance|
|7 Analytics/SEO|In progress|Preview visit/search events,local schema checks,dynamic sitemap|External validation,durable analytics,remaining discovery pages|
|6 Marketing|Blocked|Manual-post wording/tests|Authenticated upload/download/schedule acceptance|
|8 Launch materials|In progress|Playable30s still-capture MP4 decoded;draft guides/scripts|Actual phone playback;full narrated/mobile demo;guides after pro-flow certification|

## Compact search claim-action correction
- Root cause: `.favorite-card > a:not(.favorite-control)` applied `height:100%` to the separate market-claim-link, producing the observed oversized blank claim panel. Save was positioned relative to the whole wrapper, including that panel.
- Commit cf5e059d7b0d90c0eeafe8dcc97fe9ac910786ef excludes claim links from full-height styling. Only wrappers with direct claim actions use a two-row grid:profile/Save in row1,minimum44px claim target in row2. Claimed/home cards without that action retain previous layout. URLs/content/claim state untouched.
- Targeted command with GOBOOKR_PGLITE_MODULE enabled:node --test tests/favorites.test.js tests/claim-discovery.test.js tests/claim-mobile-ui.test.js tests/claim-mobile-render.test.js. Result8 pass,0 fail,0 skipped. These verify behavior/markup and isolated Postgres constraints;they do NOT prove browser geometry.
- Vercel dpl_E1PKeP6LTUjKBhjd45DApBvS2zBR READY:https://gobookr-du3vu8mw3-mattmedina4224-7308s-projects.vercel.app. Actual browser navigation to deployed search redirects to Vercel login. Mobile/desktop visual acceptance blocked on existing expired-session gate;no retry loop,protection change or bypass.
- Correction is implemented,NOT visually verified or shipped. PR135 remains unmerged;production,data,billing and authentication settings unchanged. Claims/billing/inventory blockers remain as listed above.

- Application correction CI:GitHub GoBookr checks run769 (37240982753) completed success. READY deployment and green CI do not replace pending mobile/desktop visual acceptance.

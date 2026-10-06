# Public verification evidence — follow-up

Application commit:0a87617776da7600ab5d0d0daffd970a2a806f57. GitHub checks run763 completed success. Vercel deployment dpl_3cPxP7cBgdks5EhngFKGQ93UK7sv READY.

Preview: https://gobookr-nl4ltu7vg-mattmedina4224-7308s-projects.vercel.app

## Tests

Full isolated suite:231 pass,0 fail,0 skipped,5562.918299ms, including the three read-only booking-auditor tests. Syntax:127 JavaScript files checked,exit0.

## Deployed response checks

| Route | Result |
|---|---|
| `/` | HTTP200 |
| `/search?category=massage_therapist&city=Fort%20Collins` | HTTP200; distinct category/city title; two results |
| `/pro/522` | HTTP200; Person metadata |
| `/discover/fort-collins/massage_therapist` | HTTP200; unique title/canonical; index,follow; CollectionPage metadata |
| `/discover/fort-collins/nail_technician` | HTTP200; noindex,follow; no structured-data list |
| `/sitemap.xml` | HTTP200;nine URLs; empty Fort Collins nail pair excluded |

No browser mobile/desktop acceptance is claimed for this new application commit. Earlier screenshots are for prior application commits. No production release yet.

## Actual preview analytics logs

Read from Vercel runtime logs, not constructed test expectations. These requests were QA probes, not customers or unique visitors.

```json
{"message":"gobookr_analytics","version":1,"environment":"preview","request_id":"464ee12e-9bc3-423e-84b8-e5a05bd8920d","route":"/","timestamp":"2026-10-04T20:50:53.402Z","event":"visit"}
{"message":"gobookr_analytics","version":1,"environment":"preview","request_id":"7b0a0b95-362b-4baf-9b40-8449eb69540d","route":"/search","timestamp":"2026-10-04T20:50:57.846Z","event":"visit"}
{"message":"gobookr_analytics","version":1,"environment":"preview","request_id":"7b0a0b95-362b-4baf-9b40-8449eb69540d","route":"/search","timestamp":"2026-10-04T20:50:57.846Z","event":"search","category":"massage_therapist","result_type":"all","has_location_filter":true,"has_text_filter":false,"result_count":2}
```

Profile/booking-click events were already verified by the earlier production read-only pro_events query. Visits/searches now emit in preview runtime logs. A durable visit/search dashboard and analytics retention/export remain unfinished. No paid analytics plan or drain installed.

## Local schema-tool results

Tool: scripts/validate-structured-data.js. Current official vocabulary downloaded from https://schema.org/version/latest/schemaorg-current-https.jsonld; SHA256:0a4b8c4c910fc831ec8695196510973390906a5ee34dc6b862dfec4d21a12f74.

| Actual deployed JSON-LD | Nodes checked | Properties checked | Errors |
|---|---|---|---|
| Profile522 |3|8|0|
| Fort Collins massage collection |4|11|0|

Exact extracted inputs are in qa-schema/. Checker covers known types/properties, property domains and typed-object ranges. It does not certify factual identity, required Google rich-result fields, every primitive value or search-engine eligibility. External Schema.org web validator remains blocked by browser tool timeout; do not call these official validator results.

## Inventory category query

Read-only authoritative pro_categories query using the live visibility predicate:barber215;stylist112;nail48;lash38;tattoo24;massage22;colorist19;brow12;waxing12. No makeup or wedding category rows returned. Categories overlap, so these are not additive unique-person counts.

## Read-only booking HTTP audit

Completed 2026-10-04T20:58:44.740Z. Input:500 publicly visible rows,222 unique populated URLs. Counts below are affected profile rows, not unique destinations. No production changes, appointments, form submissions or retries.

| Classification | Profile rows |
|---|---:|
| HTTP reachable, identity and booking flow unverified |198|
| Missing booking URL |185|
| Generic directory |101|
| Deleted-business redirect |12|
| HTTP502 requiring review |3|
| Network timeout, unverified |1|

Deleted-business redirects:17,35,49,106,233,235,237,238,423,431,478,496. HTTP502:181,182,183 share one GlossGenius destination. Profile493 exceeded the12-second timeout; this does not prove the destination is dead. No repeat request was made. Full machine-readable report:qa-booking-http-audit-2026-10-04.json. Reproducible auditor: scripts/audit-booking-destinations.js with qa-booking-input-2026-10-04.json.

HTTP200 does not establish the correct professional, address, current services, appointment availability or mobile usability. These results are a review queue, not a legitimacy certificate or permission for bulk data changes.

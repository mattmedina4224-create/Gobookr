# Professional quick access

Adds a direct Openings Today link using the existing Marketing Center campaign route. Profile, openings and marketing links appear near the top of navigation, with two columns and minimum 48px targets on phones; active page has aria-current.

Login already redirects existing professional accounts to /dashboard/pro. Each of these three tools is now a direct navigation link from that destination. This is code-path evidence, not a verified mobile tap count.

Scope: dashboard navigation only. No billing, authentication, data or production changes. No installable PWA or native app is claimed.

Release gates: existing dashboard regression checks, CI and Vercel preview; signed-in mobile/desktop walkthrough remains blocked because isolated preview has no test accounts and browser API has no viewport resize. Keep draft/unmerged until acceptance passes.

## Deployed evidence

- Application commit c016edb: GitHub run 778 SUCCESS; Vercel dpl_9yqx8VCwxpoCVni631yosT1XKgiW READY.
- Public browser QA on that deployment opened /pro/522?source=qa-analytics-20261005, then clicked its actual Book Appointment link once. External destination visibly loaded https://zentherapies.glossgenius.com/services with Sheila O’Shaughnessy at Zen Therapies, massage services and the matching Fort Collins workplace address. No appointment selected or purchased.
- Before browser actions: pro 522 had 7 profile_view events and no booking_click event. SQL query after actions returned source qa-analytics-20261005 profile_view at 2026-10-05 03:02:16.788964+00 and booking_click at 03:02:24.521427+00, both anonymous actor_user_id null. booking_clicks table count for 522 was 1 afterward.
- These are real isolated-preview events, not production metrics. This verifies profile-view and booking-click recording on desktop only; visit/search events and mobile analytics remain separate, incomplete acceptance tasks.
- Signed-in dashboard itself still lacks browser acceptance. CI success and public analytics evidence do not certify its mobile tap count or installability.

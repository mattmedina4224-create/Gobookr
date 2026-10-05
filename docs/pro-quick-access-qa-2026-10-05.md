# Professional quick access

Adds a direct Openings Today link using the existing Marketing Center campaign route. Profile, openings and marketing links appear near the top of navigation, with two columns and minimum 48px targets on phones; active page has aria-current.

Login already redirects existing professional accounts to /dashboard/pro. Each of these three tools is now a direct navigation link from that destination. This is code-path evidence, not a verified mobile tap count.

Scope: dashboard navigation only. No billing, authentication, data or production changes. No installable PWA or native app is claimed.

Release gates: existing dashboard regression checks, CI and Vercel preview; signed-in mobile/desktop walkthrough remains blocked because isolated preview has no test accounts and browser API has no viewport resize. Keep draft/unmerged until acceptance passes.

# Preview database setup — 2026-10-02

Owner approved the quoted starting branch rate. Supabase rejected branch creation because the production organization is on the Free plan; no branch was created or paid-plan upgrade made.

A separate project in the existing GoBookr organization was quoted at $0/month and created as the safe alternative:

- Name: GoBookr Preview Testing
- Project ID: rpjxaaeqcqjjbjoddnke
- Region: us-west-1
- Status: ACTIVE_HEALTHY
- Original production project remains jbhgeoedwvfxjteyuxum.

Preparation completed using the Supabase connector:

- Copied public application schema (21 tables), constraints, indexes and sequence defaults from production metadata.
- Copied only four independently verified, publicly listed, unclaimed professionals /521 through /524 and their categories/source attribution.
- No real users, customer sessions, subscriptions, claims, reviews, portfolio assets or billing credentials were copied.
- Enabled RLS on all 21 application tables and revoked table/sequence access from PUBLIC, anon and authenticated.
- Verification query: four profiles; zero users, sessions, subscriptions or claims; zero tables without RLS; zero public table grants.
- Security advisor returned only informational notices for RLS-enabled server-only tables without public policies.

Not completed:

- No DATABASE_URL saved to Vercel.
- No preview deployments redeployed or approved for merge.
- App-specific database login/connection credential and reachable connection method remain to be configured through approved secure access.
- Vercel browser requested sign-in. Owner selected ChatGPT, then Google; the Google transition returned 502 / Connection refused.
- Automatic approval review rejected opening a fresh Vercel login because that would retry a blocked prerequisite contrary to the checklist instruction to note blockers once and move on. No workaround or further authentication attempt was made.

Next step: owner authorizes another Vercel sign-in attempt using a different available method, then configure only the two review branches to use the isolated database, redeploy, verify real 375px/desktop pages and add after screenshots. Keep Stripe live billing credentials out of previews.

No new paid resource was created. The free project remains subject to Free plan limits. Do not upgrade it or the organization without separate approval.

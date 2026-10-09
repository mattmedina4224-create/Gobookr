# Release checks — October 9, 2026

## Verified

- Full automated suite: 232 passed, 2 intentionally skipped, no failures.
- Stripe CLI temporary sandbox: hosted Checkout completed with Stripe's test card, payment_status=paid, amount_total=40000 USD minor units; subscription active, quantity 20, livemode=false.
- Real sandbox API integration through application billing modules: signed application webhook returned 200, enabled coverage for 20 isolated PostgreSQL fixture accounts, seat removal updated Stripe quantity to 19, professional profiles remained intact. This webhook was delivered directly to the handler, not through a deployed Stripe endpoint.
- Preview billing gate permits sk_test_, rk_test_ and CLI rkcs_test_ keys; rejects live and publishable keys.
- 375px browser review of isolated business basics, professional services and review screens: readable controls, leading + for adding services, Save & continue, no overlapping actions.
- Approved professional UI deployed to production. Public homepage returned HTTP 200; Openings Today absent from main navigation; footer has no copyright year.

## Remaining before calling the complete customer walkthrough verified

- Preview Supabase has no configured storage credentials or photo buckets. Supabase dashboard sign-in was requested securely and canceled. Do not copy production keys into preview or open anonymous upload permissions.
- Finish a real preview upload through the app, reload and confirm the image and profile fields persist.
- Complete an authenticated mobile signup-to-dashboard walkthrough with a configured preview and confirm deployed Stripe webhook delivery. Isolated UI fixtures and local signed-handler integration do not establish these checks.

All financial testing used an isolated Stripe sandbox. No real charges, subscriptions or refunds were created. Test subscriptions must be cleaned up within the sandbox.

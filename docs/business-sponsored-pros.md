# Business-sponsored professional memberships

Business accounts remain complimentary. Claimed business owners invite professional accounts by their normalized GoBookr email. Invitations appear inside GoBookr; this feature does not send external emails. Invited professionals must sign in with the matching account and accept. Business owners never acquire profile ownership or editing access.

## Billing behavior

- $20 USD per professional per month; 20 accepted professionals cost $400/month.
- Pending invitations are not billable.
- Owners explicitly confirm the total and start one Stripe subscription with the accepted team size as its licensed quantity.
- Webhooks retrieve canonical subscription state. Payment success or a valid Stripe trial activates coverage; a checkout redirect does not.
- New accepted members require the owner to update the team plan. Existing sponsored members remain covered while that update is pending.
- Quantity changes affect the next invoice with no mid-month prorated charge/refund.
- Removing a sponsored pro reduces the recurring quantity. Removing the last sponsored pro schedules cancellation at period end.
- A professional can leave their team. Their account, booking URL, saved profile, and original individual trial/subscription remain intact.
- Existing personal Stripe subscriptions must end before sponsorship can be accepted. A database reservation also prevents a personal checkout from racing invitation acceptance.
- Payment failure retains existing membership records and allows retries using the same idempotency key. Ambiguous billing operations older than 23 hours fail closed for reconciliation.
- Team plans cannot grant more sponsored profiles than Stripe's confirmed quantity. Past-due plans receive the existing seven-day grace policy.
- Billing mutations use a database lease and saved operation parameters. Team reads bypass the old process read cache.

## Deployment

Migration: db/migrations/20261009064029_business_sponsored_professionals.sql
Also apply db/migrations/20261009065235_personal_checkout_sponsorship_fencing.sql. Personal checkout retries reuse a persisted key, and the reservation outlasts Stripe's checkout expiry to prevent a pending personal checkout from overlapping sponsorship.

Apply the migration before setting BUSINESS_TEAMS_ENABLED=1. The feature is disabled by default, preserving deployments that do not have the schema yet.

Team tables have RLS enabled and no client role grants. GoBookr's server authenticates owners and invited professionals before accessing them. This application uses its own integer user IDs, not Supabase Auth JWT identities.

Preview checkout requires Stripe sandbox keys and a webhook secret. Live keys are deliberately rejected for team billing on Vercel previews. Configure the preview's APP_URL and a sandbox Stripe webhook for that exact preview before testing payments. Subscribe to checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid and invoice.payment_failed.

Production release requires applying the migration, reviewing the code, completing the sandbox payment flow, and enabling BUSINESS_TEAMS_ENABLED on production. No real Stripe subscriptions or charges were created during development.

## Verification

PostgreSQL integration tests cover owner authorization, consent, normalized invites, matching-account acceptance, personal billing exclusion, profile ownership preservation, webhook activation, seat removal, failure retries, idempotency, price and quantity, payment grace, sponsored discovery visibility, and client-role access denial.

Routes:
- /dashboard/shop/team
- /dashboard/pro/team

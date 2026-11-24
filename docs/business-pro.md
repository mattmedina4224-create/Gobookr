# GoBookr Business Pro + Career Studio

Proposed paid tier for claimed businesses. **Not live. Needs design and billing approval before merge.**

## What is free and what is paid

| Free business account | Business Pro ($39/month, configurable) |
|---|---|
| Claimed, customizable business page | Accept résumés and applications |
| Photos, services, team display | Hiring Inbox |
| Employee invitations, workplace management | Two-way messaging with applicants |
| Merch Studio purchases | Publish job openings (drafts are free) |
| Existing business functionality | Candidate statuses, hiring notifications |
| | Recruiting search (later) |

The following stay free for professionals:
- Résumé (Career Studio)
- Applying
- Messaging businesses that have Business Pro
- Self-service workplace management

## Billing separation

Business Pro never shares anything with the professional plan or sponsored seats:

| | Business Pro | Professional $20/month | Sponsored seats |
|---|---|---|---|
| Table | `business_pro_subscriptions` | `subscriptions` | `business_team_plans` |
| Stripe customer | one per business | the professional's | the business's team plan |
| Metadata | `kind=business_pro`, `business_pro_shop_id` | `pro_id` | `business_team_shop_id` |
| Webhook | `/business-pro/stripe/webhook` | `/stripe/webhook` | `/stripe/webhook` |

- `/stripe/webhook` explicitly ignores Business Pro objects.
- Business Pro never sets `metadata.shop_id`, because the legacy shop-subscription matcher uses that key.

## Entitlement (server-side, checked on every hiring read and write)

Hiring tools are unlocked only when all of these hold:

1. The user owns the claimed shop.
2. The subscription was started by the current owner.
3. Its status is `active`/`trialing`, or `past_due` within the grace period (`BUSINESS_PRO_GRACE_DAYS`, default 3).
4. Its billing mode matches the deployment (test vs live).
5. Its period has not ended more than 3 days ago without a renewal.

When access lapses:
- Openings are hidden from the public.
- Applications are blocked.
- The inbox shows only a count, with no names, résumés or messages.
- Nothing is deleted. Re-subscribing restores everything.

## Configuration

| Variable | Purpose |
|---|---|
| `CAREER_STUDIO_ENABLED=1` | Turns on Career Studio, the Hiring tab and the Business Pro tab. |
| `BUSINESS_PRO_PRICE_CENTS` | Price in cents. Default 3900. |
| `BUSINESS_PRO_STRIPE_PRICE_ID` | Optional approved Stripe Price. Without it, Checkout uses inline test pricing. |
| `BUSINESS_PRO_STRIPE_SECRET_KEY` | Optional dedicated key. Use a `sk_test_` key on previews; it overrides `STRIPE_SECRET_KEY`. |
| `BUSINESS_PRO_WEBHOOK_SECRET` | Signing secret for `/business-pro/stripe/webhook`. |
| `BUSINESS_PRO_LIVE_BILLING=1` | Required before a live key may create a charge. Leave unset until approved. |

## Preview demo

`/business-pro/demo` needs no database. It shows the real dashboard views in every state, using a fictional business and fictional applicants.

With `BUSINESS_PRO_STRIPE_SECRET_KEY=sk_test_…` set for the branch, Upgrade runs a real Stripe test-mode checkout, and Manage billing opens the test portal.

## Launch checklist (needs approval)
- [ ] Approve the design and the free/paid split.
- [ ] Approve the price and create the live Stripe Price. Set `BUSINESS_PRO_STRIPE_PRICE_ID`.
- [ ] Configure the Stripe customer portal: allow cancellation and payment-method updates.
- [ ] Add the webhook endpoint `/business-pro/stripe/webhook` with these events:
  - `checkout.session.completed`
  - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
  - `invoice.paid`, `invoice.payment_failed`
- [ ] Merge PR #303 first, then apply `20261122_career_studio_business_pro.sql` (new tables only).
- [ ] Set `CAREER_STUDIO_ENABLED=1`, then `BUSINESS_PRO_LIVE_BILLING=1` only after a test-mode run is signed off.

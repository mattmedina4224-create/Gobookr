# Merch Studio launch checklist

Nothing here has been done in production. Every step needs the owner's go-ahead.

## Before merge
- [ ] Visual approval of the designer, the order page, the capability page and the demo, on the branch preview or locally.
- [ ] Decide the GoBookr margin. `MERCH_MARKUP_BPS` defaults to 0, which passes the supplier cost through.
- [ ] Decide who gets the nav link. Today it shows for professionals. Business owners need an entry point from the
      business dashboard.

## Printful (real account)
- [ ] Create an API token with the orders, products and webhooks scopes. Set `PRINTFUL_API_KEY` and, if the token is
      account-level, `PRINTFUL_STORE_ID`.
- [ ] Confirm the exact print-file sizes for products 724 (cards), 358 (stickers) and 71 (tees) against Printful's file
      guidelines. Adjust `SPECS` if any differ.
- [ ] Confirm that variant matching resolves exactly one variant for every option. Run a quote with `MERCH_LIVE_FULFILLMENT=1`
      against a **draft-only** test. Confirm the draft order is visible, then delete it.
- [ ] Upload the black-and-white GoBookr logo (3″ × 2″). Set the default packing-slip message and support email under
      Settings → Branding. Optionally set `MERCH_PACKING_SLIP_LOGO_URL`.
- [ ] Register the webhook URL `https://gobookr.com/merch/printful/webhook/<PRINTFUL_WEBHOOK_TOKEN>` for
      package_shipped, order_failed, order_canceled and order_put_hold.

## Stripe
- [ ] Add a second webhook endpoint, `https://gobookr.com/merch/stripe/webhook`, for `checkout.session.completed` and
      `checkout.session.async_payment_succeeded`. Store its secret as `STRIPE_MERCH_WEBHOOK_SECRET`.
- [ ] Sales tax: decide whether to charge Printful's estimated tax or enable Stripe Tax. Stripe Tax needs registration
      decisions.
- [ ] Run a full order in Stripe **test mode** on the preview, using test cards. Do not set `MERCH_LIVE_PAYMENTS=1`
      until it passes.

## Database and storage
- [ ] Apply `db/migrations/20261121_merch_studio.sql`. It only adds new tables.
- [ ] Print files are stored in the public `portfolio` bucket under `merch/`. Printful must be able to fetch them, so
      they must be public.

## Turn on
- [ ] `MERCH_STUDIO_ENABLED=1` on preview first, then production.
- [ ] Place the first live order for GoBookr's own business, with the owner present. Then confirm the Printful
      dashboard, the packing slip, tracking and the receipt.

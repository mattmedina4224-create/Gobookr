# Task #8 — $20/month conversion flow

GoBookr Professional uses one simple individual membership:

- 30-day free trial.
- $20 USD per month after the trial.
- Stripe-hosted subscription Checkout for payment setup.
- Existing trial deadline is preserved when payment is set up early; the trial is not restarted.
- Stripe Customer Portal handles payment-method updates, invoices, cancellation, and reactivation.
- Webhooks synchronize subscription status back to GoBookr.
- Failed payments receive the existing 7-day grace period before the public profile is hidden.
- Successful payment restores eligible profile visibility.
- Business-sponsored professionals do not start a duplicate individual subscription.

## Conversion UX

The product should create urgency without constant nags:

- More than 14 days remaining: no global billing banner.
- 8–14 days remaining: a light reminder that the profile remains live during the trial and can stay searchable afterward for $20/month.
- Final 7 days: a clearer continuation prompt.
- Trial expired: profile-hidden message with an activation CTA.
- Billing page always shows the exact $20/month renewal price and trial/renewal status.

The checkout code validates that the professional Stripe price is active, USD, exactly 2000 cents, monthly, recurring, and licensed. The preferred lookup key is `gobookr_professional_monthly_20`.

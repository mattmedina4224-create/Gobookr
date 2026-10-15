# Post-publish email confirmation

Professionals publish their page as before. When delivery is enabled, the finish
action sends a 6-digit code to the signed-in account email and opens
`/dashboard/pro/confirm-email`. The dashboard has a return link for unfinished
confirmation. This confirms account email only, never a license, imported
listing ownership, subscription eligibility, or professional credentials.

The screen supports `autocomplete="one-time-code"`, numeric keyboards, pasting,
and manual entry. The browser/email app controls whether AutoFill is offered.
GET requests never send email or consume a code. Both POST forms use the existing
session/CSRF protection. There is no unauthenticated code-verification endpoint.

## Enable delivery

This release is disabled by default. Until configured, publishing has no email
dependency and the confirmation page explains that delivery is unavailable.

1. Connect a transactional sender account. The included transport uses Resend's
   documented `POST https://api.resend.com/emails` API. No provider account,
   subscription, DNS changes, or real messages were created during implementation.
2. Verify the sender domain with the provider and choose its From address.
3. Apply `db/migrations/20261015210847_profile_email_confirmations.sql` to the
   intended database. It creates a private RLS-enabled table with no anonymous
   or authenticated Data API grants. The server's existing Postgres connection
   accesses it. No existing profiles/users are changed.
4. Configure server-only `RESEND_API_KEY`, `PROFILE_EMAIL_FROM` (e.g.
   `GoBookr <confirm@YOUR-VERIFIED-DOMAIN>`), and `EMAIL_VERIFICATION_SECRET`
   (at least 32 random characters). Never paste keys into chat or commit them.
5. Set `PROFILE_EMAIL_CONFIRMATION_ENABLED=1` only after configuration and the
   migration are ready; redeploy. Do not enable preview delivery with production
   credentials. The email Return button intentionally points to gobookr.com.
6. With a consented test recipient, verify delivery, iPhone Safari/Mail AutoFill,
   manual/paste entry, resend, expiry, and dashboard confirmation. API acceptance
   does not guarantee inbox delivery. Real inbox and device testing remain pending.

Codes expire in 10 minutes, have 5 attempts, and are replaced on resend. Requests
are limited durably to one per 60 seconds and 5 per hour per professional, even
across Vercel instances. Send failures consume this allowance to prevent retry
storms. HMAC digests bind codes to user, profile, email, and random nonce; raw
codes exist only in the outgoing request. Success clears the digest. A changed
account email or transferred profile cannot reuse earlier confirmation. Key
rotation invalidates pending codes; verified email records are retained.

Publishing is not rolled back if delivery fails. The user may continue to the
dashboard. No bulk confirmation messages are sent to existing users or imports.

## Validation

`NODE_PATH=/path/to/dependencies/node_modules node --test tests/email-confirmation.test.js`
exercises production SQL through PGlite and the real compatibility SQL normalizer,
with email HTTP calls intercepted locally. No messages are sent by the tests.

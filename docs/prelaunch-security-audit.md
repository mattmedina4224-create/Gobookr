# GoBookr pre-launch security audit

Status: in progress — 2026-10-19

## Verified controls

- Passwords use Node `scrypt` with a per-password random salt and timing-safe comparison.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Authentication POST endpoints have rate limits for login, signup, forgot-password, reset-password, and Google auth.
- Authenticated state-changing forms are protected by a per-session CSRF token unless explicitly exempted for signed-out auth entry points.
- Password-reset responses do not reveal whether an email is registered.
- Password-reset tokens are random, stored as SHA-256 digests, expire after one hour, are single-use, and a successful reset deletes all sessions for the user.
- Profile email confirmation codes are HMAC-protected, short-lived, rate-limited, attempt-limited, and provider errors do not log addresses, codes, or secrets.
- New browser session tokens are stored in the database as SHA-256 digests; legacy plaintext session rows are transparently upgraded when used.

## Findings / follow-up

### High priority before launch

1. Production password-reset email delivery is not wired yet. The route creates a secure reset path but production delivery must use the configured transactional email provider.
2. Production profile email confirmation still requires its email-provider environment configuration and an end-to-end delivery test.
3. Add/verify security response headers (HSTS, content type sniffing protection, referrer policy, frame protection/CSP) without breaking existing inline scripts/styles.
4. Complete admin authorization review and add mandatory MFA for GoBookr administrative access if not already enforced.
5. Audit uploads for allowed image formats, byte limits, content validation, storage permissions, and executable-content rejection.
6. Audit all state-changing routes for ownership/IDOR checks and parameterized SQL.
7. Verify Stripe webhook signatures and Meta OAuth/token handling end-to-end.

### Supabase advisor note

The Supabase security advisor reports multiple public-schema tables with RLS enabled and no policies. This can be intentional for server-only tables, but each table must be checked against Data API grants/exposure before launch. Do not add permissive policies merely to clear the advisory.

## Account-level controls for the owner

Before launch, enable MFA/passkeys on the domain/email provider, GitHub, Vercel, Supabase, Stripe, and Meta. Never approve an MFA prompt that you did not initiate.

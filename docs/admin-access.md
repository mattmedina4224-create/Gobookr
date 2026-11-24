# Administrator provisioning

Admin access is an explicit `public.admin_accounts` grant for a user ID. Customer,
professional and storefront roles are unchanged. `ADMIN_EMAIL` has no authority.
No accounts are promoted by the migration, signup, password login or Google login.

Apply the admin_accounts migration to the deliberately selected database before
deploying the new admin gate. Use a trusted database operator. The application
database connection must be able to read the table and bypass its RLS (normally
the existing server-side Postgres connection); never grant access to `anon` or
`authenticated`. No public RLS policies are supplied. If the deployment uses a
different restricted database role, review its permissions before rollout.

## Verify the owner before granting

Use a trusted channel to verify the owner's identity, control of the account's
email, and exclusive control of its login credentials. Do not treat an email
match, an existing account, or a supplied name as verification. Review any linked
Google identity with the owner. A password set by an unknown person must be reset
through a trusted recovery procedure before granting; do not promote a possibly
pre-registered account. Stop if identity or credential control is uncertain.

This is a manual trusted provisioning process, not an automated email verification
service. The confirmation flag records the operator's explicit decision at the
command line; it does not itself prove identity. Keep the operator's verification
record in your secure operational records.

With DATABASE_URL securely set for the intended database, obtain and review the
existing user ID and exact stored email using your trusted database console. Then:

```sh
node scripts/provision-admin.js inspect USER_ID EXACT_EMAIL
node scripts/provision-admin.js grant USER_ID EXACT_EMAIL --confirm-owner-verified
```

Replace the placeholders; never guess them. Inspect does not grant access. Grant
requires an exact ID/email match, creates at most one grant, and deletes all that
user's sessions in the same transaction. Sign in again using the existing password
or verified Google login, then visit `/admin/licenses` or `/admin/shop-claims`.
Do not edit the grant table manually: the script also invalidates old sessions.

To revoke access and invalidate sessions:

```sh
node scripts/provision-admin.js revoke USER_ID EXACT_EMAIL
```

Every admin request checks the current grant and unexpired session directly,
bypassing the application's SELECT caches. No secrets or user data should be
committed. Provisioning is not run automatically during deployment.

## One-time grant with email verification (preferred)

`admin_accounts` and `lib/admin.js` are unchanged. This workflow is just a safer way to create the grant row. It adds proof that the account's owner controls the inbox, and an append-only audit trail (`admin_grant_audit`).

1. **Owner authorization.** Only the project owner can do this, through the trusted database channel (Supabase SQL editor or this script):
   ```sh
   node scripts/admin-grant.js authorize USER_ID EXACT_EMAIL --approver "Name <email>" --note "reason"
   ```
   The SQL editor equivalent is `SELECT public.admin_grant_authorize(USER_ID, 'EXACT_EMAIL', 'Name <email>', 'reason');`.
   This step grants nothing. The authorization:
   - is tied to that user ID and exact email;
   - expires after 24 hours;
   - supersedes any earlier open authorization.
2. **Email verification.** Sign in as that exact account and open `/account/admin-access`, then send a code:
   - The 8-digit code is emailed only to the authorized address and expires in 15 minutes.
   - At most 5 codes can be sent per authorization, at least 60 seconds apart.
   - Only an HMAC of the code is stored.
3. **Finish.** Enter the code. Five wrong codes close the authorization. On success, one database transaction:
   - inserts the `admin_accounts` row;
   - records `verified_and_granted` in the audit trail;
   - deletes the account's sessions.
   Sign in again, then open `/admin/shop-claims`.

`/account/admin-access` returns 404 to any account without an open authorization. No route can create one.

Required environment variables:
- `RESEND_API_KEY`
- `ADMIN_GRANT_EMAIL_FROM` (falls back to `PROFILE_EMAIL_FROM`), using a verified sending domain
- `ADMIN_GRANT_SECRET`, at least 32 random characters

Without these, no code is sent and nothing can be granted.

Check progress: `node scripts/admin-grant.js status USER_ID`. Cancel an authorization: `node scripts/admin-grant.js cancel REQUEST_ID --approver "Name <email>"`.

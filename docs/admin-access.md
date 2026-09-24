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

# Customer Favorites

Favorites are independent of any future Follow feature. Customers save or remove
professional profiles from discovery cards and profile pages, and revisit them in
`/dashboard/customer`. Professionals see only their own current total in analytics;
this is not a 30-day event count. No customer list or identity endpoint is exposed.

## Access model

GoBookr uses its own server-side sessions and BIGINT `public.users` IDs. It does not
use Supabase Auth UUIDs. The server takes the customer ID from the verified session,
requires the customer role, and applies the existing POST CSRF middleware. Requests
set an explicit saved/unsaved state, so retries do not invert the user's intent.
The composite primary key prevents duplicate saves, including concurrent inserts.

The migration enables RLS and revokes PUBLIC, anon, and authenticated privileges.
There are deliberately no browser policies, public views, or SECURITY DEFINER
functions. Access uses the existing trusted server Postgres connection. If that
connection is changed to a non-owner role, review the access model before granting
permissions; do not grant browser roles access to this table.

Favorites queries start with a CTE to bypass both existing SELECT caches, so another
server instance's writes appear immediately. Discovery loads saved state in one
batch rather than per card. Unavailable profiles remain removable from Favorites.
Deleting a customer or professional cascades its favorite rows.

## Rollout

1. Apply `db/migrations/20260926232235_customer_favorites.sql` through the normal
   Supabase migration process before deploying this branch. The file was generated
   using the Supabase CLI and moved to this repository's established migration folder.
2. Confirm the trusted application database connection can access the table and that
   RLS is enabled with no anon/authenticated grants. Run Supabase security advisors
   against the target environment after applying the migration.
3. Deploy the application. Smoke-test two customer accounts saving the same public
   profile; confirm the owner sees 2 Saves, then 1 after one customer removes it.
   Confirm each customer dashboard contains only their own Favorites.

This PR does not apply production migrations, merge main, or deploy production.
An application rollback can leave the additive table in place without losing saves.

## Verification

Run `npm run check` and `node --test tests/*.test.js`.
For isolated PostgreSQL permission, RLS, foreign-key, and uniqueness tests, install
`@electric-sql/pglite` outside the repository and set `GOBOOKR_PGLITE_MODULE` to its
absolute module path before running tests. Without that runtime, database tests
are explicitly skipped. No production data or credentials are needed.

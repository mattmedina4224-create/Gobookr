# Staff portal and payroll — implementation record

Requested 2026-10-06: owner-managed staff access and permission selection, with payroll access in the same dashboard.

## Audit

- Main 8f502c562ccca3377edf84cd631e799878b7e198 has an all-or-nothing admin_accounts grant checked with a fresh session in lib/admin.js.
- Business profile ownership is separately enforced in routes/shop-dashboard.js. Professionals shown on a public business page are not employee login grants.
- Square integration discovers bookable team members; it is not a payroll connection.
- No staff invitation/membership/permission portal or payroll processor was found in the inspected routes and libraries.

## Foundation delivered

lib/staff-permissions.js separates platform staff and business employees, validates permission selections, and denies unknown, inactive, expired-session and cross-scope access. Owner-only staff management and payroll configuration cannot be delegated. Payroll execution is deliberately not an available permission.

This library is unreferenced by live routes. It does not change existing admin access, provision staff, create tables, send invitations or connect payroll. Tests demonstrate policy behavior, not a functioning staff portal.

## Confirmed scope

Owner confirmed internal GoBookr employees and a separate GoBookr owner dashboard. Novo Barbers and other business dashboards are untouched. Screenshot references specify employee name/avatar and Personal, Job, Access and Payroll sections with simple icons and edit rows. No employee identity or credential from those screenshots is imported.

## Staged implementation

- /owner overview, /owner/staff roster, /owner/staff/new add-existing-account form, employee detail and Personal/Job/Access editors, /owner/payroll disconnected status, /staff read-only self profile and granted tools.
- Manual staff_ops schema: trusted owners, employee membership/details, versioned permissions, audit history. It is NOT installed on any remote database and has no automatic owner grant.
- Async store validates a live owner/session for every owner action, locks owner/session within transactions, rejects elevated or duplicate accounts, normalizes review permissions to include read, uses optimistic versions and rolls changes back if audit fails.
- Add employee uses an existing GoBookr account and requires owner identity confirmation. It does not send invitations or modify account emails/passwords. Email invitations remain pending a verified sender and verified identity acceptance flow.
- Existing admin guard optionally checks fresh scoped staff permissions for known claim/license/outreach routes. Unknown operations deny. Legacy administrator grants remain unchanged; an account with one is rejected from the restricted staff onboarding flow because that grant would override employee permissions.
- Every owner/staff route is OFF unless GOBOOKR_STAFF_PORTAL_ENABLED=true. Disabled routes return 404 and never open a database pool. No settings or secrets were changed.
- Activate only after installing the manual schema on isolated preview, verifying the exact owner user ID/account and separately provisioning that owner grant, passing full signed-in mobile/desktop flows, reviewing backend DB privileges, and enabling the flag in a reviewed rollout. Auth/owner grants and settings require explicit owner authorization.
- Payroll shows Not connected with no run/enroll/payment action. No provider selected, connected, or certified.

## Portal completion

- Owner provisions invitations; acceptance requires authenticated identity, a verified matching email, single-use hashed expiring tokens and atomic acceptance. No public invitation endpoint may grant admin_accounts access.
- Restricted memberships scoped to the chosen organization; permissions editable only by its trusted owner. Re-check live membership/session on every protected request. Revocation must invalidate authorization across instances.
- Owner staff list, invitation status, permission checkboxes and deactivate action; employee dashboard exposes only permitted modules. Existing admin endpoints must enforce their specific permission server-side, including direct POST requests.
- Audit all invite, acceptance, permission and deactivation changes in the same database transaction. Do not log invitation tokens or payroll personal information.
- Test unauthorized invite/update, self-escalation, stale session, cross-organization access, invite replay/expiry, immediate revocation and owner-lockout protection.
- Verify owner and employee flows at 390px and desktop on a Vercel preview before merge.

## Payroll completion and boundary

Use a verified payroll provider for enrollment, tax calculation/filing and disbursements. Never collect SSNs or bank details in the generic staff record. Use hosted provider enrollment and minimal provider IDs.

Square's Team API supports roster/wage information, but its documentation says team permissions and payroll enrollment must be managed in Square Dashboard. Payroll is not available in Square Sandbox Dashboard. Source checked 2026-10-06: https://developer.squareup.com/docs/team/overview

Determine employer and provider before implementation. A provider handoff is not embedded payroll; label status honestly as Not connected until verified. No fabricated pay runs, Paid labels or automatic financial execution. Sandbox tests only; separate owner authorization for employer enrollment, sensitive settings or real payroll.

Remaining gates: verified owner provisioning, isolated preview activation, full-flow mobile/desktop visual and save testing, email invitation delivery, payroll provider/employer selection and sandbox evidence. No employee invitation, financial action or production database change performed. Local embedded Postgres tests are evidence for SQL/security behavior, not remote deployment or visual acceptance.

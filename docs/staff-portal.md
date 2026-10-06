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

## Required scope decision

Confirm whether the owner's dashboard means internal GoBookr company administration or business owners managing their own employees. This determines tenant boundaries, invitation destination and which existing routes must enforce permissions. Do not silently give barbers access to platform administration.

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

Remaining gates: scope, provider selection/access, isolated database schema and permission testing, portal UI, invitation delivery, full-flow mobile/desktop QA, payroll sandbox evidence. No employee invitation, financial action or production database change performed.

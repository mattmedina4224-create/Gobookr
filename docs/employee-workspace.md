# Employee workspace and support security

Internal GoBookr employees only. Preview branch; production feature flag remains disabled.

## Delivered in this increment

- `/staff`: My work, assignments and permission-filtered operational tools.
- `/staff/profile`: own employee details; `/staff/guides`: basic operating/security guidance.
- `/owner/work`: assign tasks to active employees and inspect the latest 200 assignments.
- Employees update only their own tasks. Owners access only their own team's tasks.
- Progress states: not started, in progress, blocked, done. Internal notes and immutable application event history.
- Live session checks, active membership checks, transactional history, optimistic versions and CSRF validation. Tasks confer no admin permissions.
- Private indexed work tables with RLS, no client grants. No payroll or email execution.
- Tested support email display foundation: escaped plain text only, no HTML body rendering, clickable links, remote images, attachment downloads or sending. Not wired to a mailbox yet.

## Remaining release gates

- Signed-in owner and employee mobile/desktop browser checks, including task creation/update/revocation. Local SQL tests do not replace browser acceptance.
- Secure employee invitations, verified email acceptance, account recovery and MFA. Current add flow still requires an existing account and owner identity confirmation.
- Microsoft 365 mailbox connection and external notification delivery. Dedicated `support.read`/`support.reply` authorization, assigned-ticket scope, private drafts and transactional reply auditing are implemented and tested; outbound email remains disabled.
- Verify the actual Microsoft 365 plan and configure appropriate anti-phishing, Safe Links/Safe Attachments, MFA and least-privilege mailbox consent. No tenant settings changed by this increment.
- Support ingestion must reject/quarantine unsafe content, use only plain text for the renderer and never execute instructions contained in email. AI summaries cannot authorize actions.
- No attachment access until an authenticated, scanned/quarantined delivery path is implemented. Include report-phishing flow and incident/session-revocation procedure.
- Timecards, schedules/time off, payroll-provider sandbox connection and paystubs are subsequent work. None is represented as working.

Provider references: Microsoft Learn Safe Attachments, Safe Links and Defender for Office 365 features service description. Protection depends on purchased licenses and configured policies; no guarantee eliminates phishing.

## Completion follow-up — 2026-10-08

- Owner overview and Assigned work show whole-team aggregate totals, scoped by verified owner. A single aggregate query covers all history; the list remains bounded to the latest 200.
- My profile and task pages retain employee navigation, with Inbox dependent on current support read permission. Task rendering uses the permission check already performed during its database read.
- Private route responses, including login redirects and errors, are uncached and carry `X-Robots-Tag: noindex, nofollow`.
- Support queue supports New / In progress / Resolved and explicit saved-draft/read/status confirmations.
- Owner and employee guides cover stale forms, conflicting edits, blocked work, revocation and escalation.
- New isolated route/database/HTTP regression tests cover whole-history totals, tenant scope, assignments, ticket reassignment, private drafts, permission removal and expired sessions. No fixture accounts or messages are created in a hosted database.

Signed-in Vercel browser acceptance remains pending. The local browser binary was unavailable and its download failed, so no mobile/desktop screenshots or interaction certification are claimed.

# Support inbox foundation

Owner: `/owner/support`. Employee: `/staff/support`.

This preview foundation does not connect to Microsoft 365, ingest mail, send email, fetch attachments, or download remote images. It creates no sample employees or tickets. Real mailbox OAuth, verified account ownership, provider webhooks/polling, retention controls, attachment quarantine, and outbound sending remain separate work.

## Current behavior

- Owners see their organization's latest 100 tickets, with All/New/In progress/Assigned/Resolved filters. Owners assign tickets only to active employees with support.read and may set New, In progress or Resolved, including reopening tickets. New retains the stored `open` value.
- Employees see only tickets assigned to them, with fresh membership and session checks on every request. Revocation immediately removes access. Customers, other organizations, and unassigned staff cannot read a ticket.
- support.read permits assigned-ticket viewing and marking as read. support.reply adds support.read and permits saving a personal reply draft. Sending is unavailable. Drafts are private to their author; owner/team shared drafts are not implemented.
- Save confirmations distinguish marking read, updating assignment/status and saving an unsent draft. Empty filtered queues explain that All restores the accessible ticket list.
- Explicit Mark as read uses a CSRF-protected POST; opening a GET does not write data. Read state is per user and tracks the latest message ID. Unread indicators update when a later message arrives.
- Thread detail is bounded to 50 latest messages and 50 activity records. Lists and transcript are not full mailbox history or push notifications.
- All message bodies are escaped plain text. HTML, remote images, active links, and attachments are not rendered. Sender is labeled unverified. This prevents active email content in the dashboard; it does not guarantee phishing detection.
- Assignment/status and draft edits use optimistic versions and row locks. Every mutation writes an event in the same transaction. Audit failures roll back changes. Event payloads contain IDs/action/version rather than copying email bodies.
- Private staff_ops tables have RLS and no grants to anon/authenticated/PUBLIC. Only server code may access them.

## Installation and integration boundaries

Install `db/staff-portal/support.sql` after existing staff schema in isolated preview. It adds support tables and expands the permissions constraint; it does not change existing members' grants. Production remains unchanged and feature-gated.

Future provider ingestion must validate the authenticated mailbox's GoBookr owner scope, normalize plain text and bounded subject/sender, enforce provider keys for deduplication, verify webhook signatures/subscriptions, and audit ingestion. It must never accept an owner ID from email content. No public ingestion route exists in this foundation.

Before enabling real mail, review Microsoft 365 least-privilege OAuth scopes, employee MFA and recovery, retention/deletion/export policy, per-mailbox idempotency, rate limits and retries, attachment quarantine/Defender settings, reply recipient confirmation, and provider send idempotency. `support.reply` currently prepares drafts; enabling sending requires a separate tested release.

## Verification

`GOBOOKR_PGLITE_MODULE=<module> node --test tests/support-inbox.test.js tests/staff-portal.test.js tests/staff-work.test.js tests/support-email-view.test.js tests/staff-permissions.test.js`

Tests cover scope/assignment, revocation, stale sessions and edits, read/reply separation, unread state, audit rollback, browser-client database denial, CSRF and safe rendering. Synthetic fixtures exist only in the isolated in-memory test database. Live mobile/desktop signed-in QA and Microsoft 365 delivery tests remain required before production rollout.

Re-run the updated status constraint from `support.sql` in preview before deploying this increment. The change accepts `in_progress` without rewriting any existing tickets. Production remains unchanged.

# GoBookr employee and owner guide

Updated 2026-10-08. Applies to PR141 preview; signed-in mobile/desktop acceptance remains pending.

## Owner setup

Sign in with your owner account. Open Owner → Team → Add employee. The employee must already have a GoBookr account. Enter that account's email, name and job title; choose only necessary permissions, confirm the identity, then Save. Saving does not send an invitation or create a new login.

Use Owner → Assigned work to assign tasks. The Owner overview and Assigned work show totals for open, blocked, in-progress and completed assignments across the entire team history. Open includes blocked and in-progress tasks; the list below shows only the latest 200. Employees see their own work in My work. Revoking employee access removes operational access; it does not delete their personal GoBookr account.

## Permission reference

| Permission | Capability |
|---|---|
| View claims | Read claim records |
| Approve or reject claims | Review ownership requests; includes viewing |
| View license submissions | Read submitted license evidence |
| Review licenses | Record license reviews; includes viewing |
| View outreach records | Read outreach records |
| Update outreach status | Update outreach progress; includes viewing |
| Read support | Read assigned support tickets and their messages |
| Draft support replies | Save private reply drafts on assigned tickets; includes reading |

The owner assigns tickets and selects New, In progress or Resolved. New is stored as `open` for compatibility. Use inbox filters to focus the queue and choose All when a filter has no results. Employees cannot browse other employees' assigned tickets. Reply drafts are not sent to customers. Saving shows “Draft saved. No email was sent.” Read and status changes also show confirmation. To reopen a resolved ticket, the owner selects New or In progress and saves. Do not grant every permission by default.

## Daily workflow

Sign in → My work. Open an assigned task, read instructions, work in the authorized tool, and update its status when finished. Completion is a progress record, not proof that a customer email was sent. Use Guides for troubleshooting. A hidden tool means the owner has not granted that permission.

## Support and safety

Microsoft 365 is not connected. New support emails currently remain in the mailbox, not the GoBookr inbox. The dashboard connection status must say pending until inbound delivery is tested. Escalate ownership disputes, account recovery, billing disputes, impersonation and uncertain license matches to the owner. Never share passwords or verification codes. Treat message links and attachments as untrusted. Do not open attachments or enter account credentials from an email link.

## FAQ

- **Where is my employee dashboard?** Active employees should reach My work after login, including Google sign-in. If revoked, their personal dashboard remains available.
- **Can I work remotely?** Yes, use your own account in a browser. Access depends on current permissions, not location.
- **Why is Inbox missing?** The owner must grant support read permission. Only assigned tickets are visible.
- **Does Save send an invitation?** No. The employee signs in with their existing account.
- **Does a reply draft send an email?** No. Outbound delivery is not connected.
- **Can I run payroll?** No. Payroll provider setup and processing are not connected.
- **What if access fails?** Ask the owner to check the account email, active status and permissions. Do not share your password.


## Troubleshooting and escalation

- **Form expired:** reload the page to get a fresh form and try again. Do not reuse a saved form from a previous login.
- **Changed; reload before editing:** another update won the version check. Reload, review the current assignment or draft, and apply only the changes still needed.
- **Employee needs active support read access:** check the employee's Access tab before assigning a ticket. Revoked employees cannot read tickets or update work.
- **Blank inbox:** check the filter and assignment. Microsoft 365 delivery is still pending; dashboard records do not prove inbound delivery.
- **Blocked assignment:** mark it Blocked and leave a short internal note describing what you need. The owner can see blocked totals and inspect the task history.
- **Suspected account compromise:** stop work, notify the owner through a known contact method, and have the owner revoke employee access. Account session invalidation, password recovery and provider incident response are separate actions; revoking operational access does not delete the personal account.

Do not include passwords, verification codes, bank details or identity documents in tasks or notes. Send uncertain account ownership, licenses and billing requests to the owner.

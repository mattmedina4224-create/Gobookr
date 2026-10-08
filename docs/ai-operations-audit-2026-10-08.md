# AI Operations audit update — 2026-10-08

Scope: main 8f502c562ccca3377edf84cd631e799878b7e198 plus unmerged staff/support work in PR141. This supplements docs/ai-operations-architecture.md; it does not certify production scale or external integrations.

## Existing and missing

The existing dormant ai_ops foundation already provides an allowlisted rules job, idempotency, bounded retries, lease fencing, human-review findings, audit events and a usage ledger. It makes no model/network calls. Tests verify behavior in embedded Postgres; multi-connection production load is not yet tested.

PR141 adds owner/employee permissions, assignments, safe support rendering and private reply drafts. Current checks cover cross-account denial, revocation, optimistic concurrency and transactional audit. It remains an unmerged preview and signed-in browser acceptance is blocked by Vercel authentication.

Still missing: Microsoft 365 inbound/outbound integration, restricted operations identity/projection, producer/outbox, retention jobs, operations review UI, provider adapters/budgets, evaluations, operational alerts and production load tests. Do not duplicate the dormant foundation or activate it with broad production credentials.

## Five first automations

1. Rules-first quality triage from verified observations; queue proposed changes.
2. Approved-FAQ support classification and cited drafts; human escalation.
3. Missing-field onboarding checklist and owner-approved wording.
4. Deterministic billing-state explanations in test mode before lifecycle delivery.
5. Daily briefing from query-backed counts and incident links.

Consequential ownership, claims, license badges, bans, data deletion/merging, billing changes, sensitive account recovery and high-risk releases remain human-controlled regardless of confidence. No automatic customer communications are enabled.

## Phase 1 and release gates

The safe queue/rules foundation is built; this pass re-runs its tests and documents the rollout. Next phase is a read-only preview pilot using an isolated restricted operations identity, exact-field producer projection, reviewed findings UI, retention and alerts. Gate activation on denial tests, failure/load tests and signed-in mobile/desktop acceptance. Keep paid providers and production mutations disabled.

Cost today: $0 in AI/API calls for this foundation. Prior architecture scenarios ($206 / $1,610 / $15,650 / $39,050 monthly for standard usage at 1k / 10k / 100k / 250k paying professionals) are planning assumptions, not measured GoBookr costs or current vendor quotes. Revalidate model availability/rates before activation. Track spend reservations and reconciled usage per professional, module and provider; infrastructure, email, registry APIs and labor remain separate.


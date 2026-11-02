# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 10:10 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ROSTER-009 — Roster approval workflow`
- **Acceptance criteria:** Owner chooses direct or approval publication; reviewer sees changes; approval/rejection is scoped and audited.
- **Phase:** Coding
- **Current activity:** Implementing the owner and manager interfaces and focused concurrency tests around the database review workflow.
- **Progress since previous report:** A new, uncommitted migration and database fixture implement mode selection, immutable review snapshots and decisions, scope checks, publication gating, policy revisions and audit records. They are not yet applied to either disposable project's migration ledger or included in this documentation checkpoint. Independent reviewer approval is the current design assumption; the requester may withdraw.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** The roster-approval migration and focused fixture passed **67/67 pgTAP assertions** inside a rolled-back transaction on the explicitly isolated `butterbox-acceptance` database. Cases include tenant and department scope, direct-publish blocking, immutable snapshots, policy revision, conflict rechecks and publication notification. The first run stopped after 50 passes when the fixture queried a protected table as an authenticated user; the fixture now verifies notification through the employee-scoped API and passes.
- **Tests intentionally deferred:** Roster-approval concurrency integration, neighbouring publication and notification regressions, Node, browser, lint, TypeScript and production build are still required. Full pgTAP, Node, authenticated integration and browser suites are deferred under the risk-based policy.
- **Remaining verification risks:** No roster-review interface or concurrent-decision verification exists yet. The copied publication path and fresh migration replay need targeted regression. Privileged business deletion can remove employment records; approved retention/deletion policy and hosted backups remain unverified. No compliance claim is made. Broader regression is required for workstream merge or release.
- **Failing tests:** None in the latest focused run; the earlier fixture permission error was corrected and rerun.
- **Blockers requiring owner intervention:** RULES-005 approved record retention/deletion and recovery policy; FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Implement accessible owner mode controls and manager submission/review/decision forms, then run concurrent-decision and neighbouring publication tests against the isolated project.
- **Latest development commit:** `a98b1ad18abc69cf12f442e9a38db26028b46a58`
- **Push outcome:** Story-selection checkpoint `ef6a4d86616716bdf811ab9b5e20f9a5da614dd3` was verified on the remote. The new implementation remains local and uncommitted pending verification.
- **Backlog:** 109 total; 46 Done, 1 In Progress, 5 Blocked, 57 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 10:36 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ROSTER-005 — Drag and drop roster changes`
- **Acceptance criteria:** Preview identifies target date and worker; conflicts block or warn appropriately; a keyboard-accessible alternative exists; undo is offered.
- **Phase:** Coding
- **Current activity:** Implementing the roster quick-change interface and server actions around the existing scoped scheduling helpers.
- **Progress since previous report:** Added an uncommitted forward migration and focused pgTAP fixture for preview, draft move, draft duplicate, and concurrency-aware undo. The migration has only been executed inside rolled-back transactions on the verified disposable acceptance database. Published originals cannot be moved; published shifts may be duplicated as private drafts. Pending review snapshots remain immutable and are rechecked on approval.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** The transactionally loaded quick-change fixture passed **46/46 pgTAP assertions**, covering preview, configured conflicts, tenant and department access, stale revisions, idempotency, exact-time undo, immutable receipts and cross-venue warnings. The first run exposed a trigger error on undo receipts; it was corrected and all assertions rerun. This is database evidence only, not story acceptance.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites are not planned for this story under the risk-based policy. Quick-change concurrency, affected publication/review regressions, client validation, accessibility/browser scenarios, lint, TypeScript and the route build remain to be run.
- **Remaining verification risks:** The uncommitted implementation is incomplete; the UI, authenticated concurrency and publication interactions must be verified before any criterion is marked passed. Broader regression is required for workstream merge or release. Privileged business deletion can remove employment records; approved retention/deletion policy and hosted backups remain unverified.
- **Failing tests:** None in the latest focused database run; the first run's immutable undo-trigger failure was fixed and rerun.
- **Blockers requiring owner intervention:** ORG-006 roster/payroll week-transition and notification-default policy; RULES-005 approved record retention/deletion and recovery policy; FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero remains deferred pending explicit owner authorisation.
- **Next concrete action:** Implement the accessible drag/drop and keyboard alternative with server-side preview, apply and undo; then run the targeted concurrency and UI checks.
- **Latest development commit:** `6fbdde15f41131ce15236bf20468b6ede23cd372`
- **Push outcome:** Planning checkpoint `3e534ae674d84fdd0fd93c8cdfdee9e7071bc179` was pushed and the remote SHA matched. The current migration and test are uncommitted and have not been pushed.
- **Backlog:** 109 total; 47 Done, 1 In Progress, 6 Blocked, 55 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

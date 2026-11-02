# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 10:44 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ROSTER-005 — Drag and drop roster changes`
- **Acceptance criteria:** Preview identifies target date and worker; conflicts block or warn appropriately; a keyboard-accessible alternative exists; undo is offered.
- **Phase:** Testing
- **Current activity:** Preparing authenticated race and production-browser tests for the connected quick-change controls.
- **Progress since previous report:** Added uncommitted roster controls, server actions, strict result parsing and targeted Node tests. Applying a change now requires the same preview that was shown, so a newly introduced warning cannot be silently ignored. The forward migration has only been executed inside rolled-back transactions on the verified disposable acceptance database; it has not yet been applied or recorded in its ledger.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** The rollback-only quick-change fixture passed **49/49 pgTAP assertions**, including a changed-warning race, tenant and department scope, exact-time undo and immutable receipts. **10/10** quick-change, copy and review Node tests passed; changed-file ESLint and TypeScript passed. The first pgTAP run's undo-trigger error was fixed and rerun. These results do not yet establish browser acceptance.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites are not planned for this story under the risk-based policy. Quick-change concurrency, affected publication/review regressions, keyboard/drag/mobile/axe browser scenarios and the production build remain to be run.
- **Remaining verification risks:** All code and tests for this story are local and uncommitted; they are not recoverable from the remote checkpoint if the workspace is lost. Browser, authenticated concurrency and publication interactions must be verified before any criterion is marked passed. Broader regression is required for workstream merge or release. Privileged business deletion can remove employment records; approved retention/deletion policy and hosted backups remain unverified.
- **Failing tests:** None in the latest focused database, Node, lint and TypeScript runs. The first database run's immutable undo-trigger failure was fixed and rerun.
- **Blockers requiring owner intervention:** ORG-006 roster/payroll week-transition and notification-default policy; RULES-005 approved record retention/deletion and recovery policy; FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero remains deferred pending explicit owner authorisation.
- **Next concrete action:** Apply the migration only to the verified disposable acceptance database, then add and run authenticated race and browser scenarios plus affected publication/review regressions and the production build.
- **Latest development commit:** `6fbdde15f41131ce15236bf20468b6ede23cd372`
- **Push outcome:** Documentation checkpoint `cced52193e974ace1193c4cc024eeb020c68975a` was pushed and the remote SHA matched. The current story's migration, UI, actions and tests remain uncommitted and have not been pushed.
- **Backlog:** 109 total; 47 Done, 1 In Progress, 6 Blocked, 55 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

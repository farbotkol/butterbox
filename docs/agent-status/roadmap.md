# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 11:00 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-005 — Privacy and retention policy` (Blocked for full acceptance; investigating a non-destructive partial safeguard)
- **Acceptance criteria:** Point-in-time location only by default; visibility and retention documented; employee access and correction; required employment records preserved.
- **Phase:** Planning
- **Current activity:** Inspecting existing deletion cascades, preservation controls and disposable test cleanup against owner decision DEC-001.
- **Progress since previous report:** BB-ROSTER-005 was verified, committed and pushed. The first push was rejected because the owner concurrently added `docs/DECISION_LOG.md`; both histories were merged without rewriting, and the remote SHA matched.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** No new retention tests have run in this planning phase. The completed roster feature passed **56/56** focused pgTAP assertions on acceptance and in a rolled-back replay, **300/300** neighbouring assertions, **2/2** concurrency integrations, **10/10** Node tests and **5/5** browser scenarios; changed-file ESLint, TypeScript and the split build passed.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites were not run for the roster feature under the risk-based policy; broader regression is needed at workstream merge or release.
- **Remaining verification risks:** Privileged business deletion can remove employment records. DEC-001 confirms non-destructive preservation and export direction, but proposed timeframes, legal requirements and hosted recovery controls are not approved or verified.
- **Failing tests:** None in the latest focused roster runs. Earlier fixture, accessibility and replay-prerequisite failures were fixed and rerun.
- **Blockers requiring intervention:** RULES-005 proposed durations, legal retention review and operational recovery/deletion controls; ORG-006 roster/payroll week-transition and notification-default policy; FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero remains deferred pending explicit owner authorisation.
- **Next concrete action:** Trace business deletion, protected employment records and test teardown, then implement only a safe non-destructive safeguard if compatible with existing workflows.
- **Latest development commit:** `2549475af5de0930f54b2b2ccf6f5ef81dc91003`
- **Push outcome:** Feature commit `2549475` and the owner's concurrent decision were merged in `7abb5ad31fb5a93440970ecb4b9b81443fc540b2`; the remote branch SHA matched at 11:00 UTC.
- **Backlog:** 109 total; 48 Done, 0 In Progress, 6 Blocked, 55 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

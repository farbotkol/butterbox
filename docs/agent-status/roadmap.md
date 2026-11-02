# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 11:05 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-005 — Privacy and retention policy` (Blocked for full acceptance; investigating a non-destructive partial safeguard)
- **Acceptance criteria:** Point-in-time location only by default; visibility and retention documented; employee access and correction; required employment records preserved.
- **Phase:** Coding
- **Current activity:** Adapting existing disposable test fixtures and deletion assertions to an intentional fail-closed business-preservation guard.
- **Progress since previous report:** Traced business cascades and found that existing database tests and many browser/integration teardowns assume privileged deletion succeeds. Drafted an uncommitted forward migration that rejects business DELETE and TRUNCATE, with no test-only bypass. It has only been exercised inside a rolled-back transaction and is not applied.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** The draft guard passed **17/17** focused pgTAP assertions in a rolled-back transaction, including owner/service-role/privileged deletion, multi-tenant preservation and TRUNCATE. The initial test run had two fixture expectations wrong: pending deferred constraints prevented the TRUNCATE test from reaching the guard, and the expected trigger-function SQLSTATE was incorrect. Both were corrected and rerun. The guard is not yet applied or release-ready.
- **Tests intentionally deferred:** The affected database, authenticated integration and browser regressions, lint and TypeScript have not yet been rerun with the guard. Broader affected regression is required because the deletion behavior is shared. Full suites were not run for the completed roster feature.
- **Remaining verification risks:** Until the draft is applied, privileged business deletion can still cascade employment records. Test fixtures must be isolated and managed without disabling the guard. A business-level guard alone cannot establish complete record preservation or hosted recovery; DEC-001's proposed timeframes, legal requirements and operational controls remain unapproved.
- **Failing tests:** None in the latest transactional guard test. The first guard test's two fixture-expectation failures were fixed and rerun.
- **Blockers requiring intervention:** RULES-005 proposed durations, legal retention review and operational recovery/deletion controls; ORG-006 roster/payroll week-transition and notification-default policy; FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero remains deferred pending explicit owner authorisation.
- **Next concrete action:** Update affected legitimate deletion assertions and disposable test teardown without a production bypass, then run broader targeted regression before applying or checkpointing the guard.
- **Latest development commit:** `2549475af5de0930f54b2b2ccf6f5ef81dc91003`
- **Push outcome:** Documentation checkpoint `685f5b8bfaf1c26b28799f19a0a765dbd963230d` was pushed and the remote SHA matched. The guard and its test changes are local and uncommitted.
- **Backlog:** 109 total; 48 Done, 0 In Progress, 6 Blocked, 55 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

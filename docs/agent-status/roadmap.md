# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 11:10 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-005 — Privacy and retention policy` (Blocked for full acceptance; investigating a non-destructive partial safeguard)
- **Acceptance criteria:** Point-in-time location only by default; visibility and retention documented; employee access and correction; required employment records preserved.
- **Phase:** Coding
- **Current activity:** Preparing the isolated migration application and broader affected integration/browser regression.
- **Progress since previous report:** Adapted existing deletion assertions and synthetic test teardown to expect preservation without a bypass. Owner decision DEC-002 was merged without rewriting concurrent history; ORG-006 remains blocked until its directed prospective venue weeks and channel dependencies are implemented.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** **557/557** assertions passed across 11 affected pgTAP files with the draft guard in rolled-back transactions. Initial deferred-constraint, SQLSTATE and business-wide break-count expectations were corrected and rerun. Changed-file lint and TypeScript passed. The guard is not yet applied or release-ready.
- **Tests intentionally deferred:** Authenticated integration and browser regressions have not yet run with the guard. Broader affected regression is required because the deletion behavior and test teardown are shared. Full suites were not run for the completed roster feature.
- **Remaining verification risks:** Until the draft is applied, privileged business deletion can still cascade employment records. Test fixtures must be isolated and managed without disabling the guard. A business-level guard alone cannot establish complete record preservation or hosted recovery; DEC-001's proposed timeframes, legal requirements and operational controls remain unapproved.
- **Failing tests:** None in the latest transactional database and lint/type-check runs. The earlier guard-test and break-count fixture expectations were fixed and rerun.
- **Blockers requiring intervention:** RULES-005 proposed durations, legal retention review and operational recovery/deletion controls; ORG-006 optional channel categories/quiet hours and approved providers, with directed week-start work still unimplemented; FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero remains deferred pending explicit owner authorisation.
- **Next concrete action:** Apply the additive guard only to the verified disposable acceptance project, run broader affected database and authenticated/browser regressions, and resolve failures before checkpointing.
- **Latest development commit:** `2549475af5de0930f54b2b2ccf6f5ef81dc91003`
- **Push outcome:** Documentation checkpoint `fc4c1da` and the owner's concurrent DEC-002 were merged in `46bd4a81442599b6d5132f747521161be29c588e`; the remote SHA matched. The guard and its test changes are local and uncommitted.
- **Backlog:** 109 total; 48 Done, 0 In Progress, 6 Blocked, 55 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

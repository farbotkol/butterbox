# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 11:22 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-005 — Privacy and retention policy` (Blocked for full acceptance; investigating a non-destructive partial safeguard)
- **Acceptance criteria:** Point-in-time location only by default; visibility and retention documented; employee access and correction; required employment records preserved.
- **Phase:** Testing
- **Current activity:** Completing the broad database rerun after preservation, concurrency and browser checks.
- **Progress since previous report:** A lock-gated deletion/clock race passed and the guard replayed inside a rolled-back isolated transaction. Browser preflight now verifies its disposable container before creating fixtures. The owner's DEC-003 was merged without rewriting concurrent history; after retention, the existing operator-enabled sample policy needs a fail-closed safety review.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** **24/24** authenticated integration scenarios plus the new deletion/clock race passed. **557/557** affected pgTAP assertions passed transactionally; corrected fixture counts passed **47/47**, **30/30** and **77/77**. The isolated rolled-back replay passed **17/17**, with no replay ledger/helper changes. Signup and **8/8** additional production-browser scenarios passed; changed-file lint and TypeScript passed.
- **Tests intentionally deferred:** The complete pgTAP rerun remains outstanding because preserved synthetic fixtures can expose further unscoped tests. Full browser and Node suites were not run for this change.
- **Remaining verification risks:** The guard is applied only in the disposable test project and remains uncommitted. Synthetic tenant records accumulate there until a separately verified disposable reset. A business-level guard alone cannot establish complete record preservation or hosted recovery; DEC-001's proposed timeframes, legal requirements and operational controls remain unapproved.
- **Failing tests:** None in the latest affected reruns. The first broader pgTAP attempt exposed unscoped fixture counts, now corrected. The first eight-browser attempt failed because the session-only diagnostic runner omitted the DB container; 32 verified synthetic Auth users were cleaned up and the rerun passed. The first replay attempt had a missing temporary-helper semicolon and was corrected.
- **Blockers requiring intervention:** RULES-005 proposed durations, legal retention review and operational recovery/deletion controls; ORG-006 quiet-hour clock times, urgent event classification and approved external providers; FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production historical-data assessment and a separately isolated demo environment. PAY-004 Xero remains deferred pending explicit owner authorisation.
- **Next concrete action:** Rerun the complete pgTAP suite against the disposable project, fix any newly exposed fixture isolation issues, then review and checkpoint the partial retention guard. Investigate DEC-003 fail-closed sample safety next.
- **Latest development commit:** `2549475af5de0930f54b2b2ccf6f5ef81dc91003`
- **Push outcome:** Documentation checkpoint `5c6b8a1169c520618f58e05ffee36fe085a939af` and the owner's DEC-003 were merged in `83e7ec412f6a3dbce63003c03ad97e840b85457c`, pushed and matched the remote SHA. The guard and its test changes remain local and uncommitted.
- **Backlog:** 109 total; 48 Done, 0 In Progress, 6 Blocked, 55 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

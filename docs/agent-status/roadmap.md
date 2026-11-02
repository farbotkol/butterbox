# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 10:19 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ROSTER-009 — Roster approval workflow`
- **Acceptance criteria:** Owner chooses direct or approval publication; reviewer sees changes; approval/rejection is scoped and audited.
- **Phase:** Testing
- **Current activity:** Adding production-browser acceptance and accessibility checks for the owner and manager interfaces.
- **Progress since previous report:** Implemented owner mode settings and manager submission, snapshot, approval, rejection and withdrawal interfaces, with explicit scoped server actions and audit labels. Applied the tested uncommitted migration only to verified disposable `butterbox-acceptance` (API 55421, DB 55422) and `butterbox-fresh-migration-check` (DB 56422). Independent reviewer approval is the current design assumption; the requester may withdraw. Implementation files remain local and uncommitted pending browser/build verification.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Roster-review pgTAP passed **67/67** on acceptance and **67/67** on replay; seven directly affected publication, conflict, tenant and audit files passed **290/290**. One authenticated concurrency integration passed, including simultaneous submissions/approvals, idempotency, edit contention, tenant scope and committed permission revocation. Focused Node tests passed **8/8**; changed-file ESLint and TypeScript passed. The replay run used the acceptance Auth helper only inside its rolled-back fixture; it remains absent afterward.
- **Tests intentionally deferred:** Production-browser scenarios and split production build are still required. Full pgTAP, Node, authenticated integration and browser suites are deferred under the risk-based policy.
- **Remaining verification risks:** Owner and manager interfaces, mobile access, audit display and notification/acknowledgement behavior still need production-browser verification. Privileged business deletion can remove employment records; approved retention/deletion policy and hosted backups remain unverified. No compliance claim is made. Broader regression is required for workstream merge or release.
- **Failing tests:** None in the latest focused runs. Two initial replay setup attempts stopped before assertions due to a missing SQL terminator and insufficient Auth-schema privileges; the corrected transactional replay passed. The earlier acceptance fixture permission error was also corrected and rerun.
- **Blockers requiring owner intervention:** RULES-005 approved record retention/deletion and recovery policy; FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Add focused production-browser coverage for settings, submission, review, rejection, mobile accessibility, notification and acknowledgement; run the split build and fix any failures.
- **Latest development commit:** `a98b1ad18abc69cf12f442e9a38db26028b46a58`
- **Push outcome:** Documentation checkpoint `673c24915aa0436a56a496fe770aa557725a0bdb` was verified on the remote. The new implementation remains local and uncommitted pending verification.
- **Backlog:** 109 total; 46 Done, 1 In Progress, 5 Blocked, 57 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 18:12 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ATTEND-006 — Late, missing and no-show alerts` (In Progress)
- **Acceptance criteria:** Configurable thresholds; duplicate alerts suppressed; acknowledgement and resolution auditable; unpublished shifts excluded.
- **Phase:** Coding
- **Current activity:** Preserving per-user notification read state and building the manager alert workflow.
- **Progress since previous report:** Applied `20261103170000` and installed pg_cron only in the positively identified disposable acceptance project (API 55421, DB 55422). The scheduled worker ran successfully at 18:10 UTC and updated its heartbeat. The uncommitted follow-up migration adds per-user notification reads so one manager's acknowledgement does not mark a colleague's notice read. The new migration and expanded tests have not yet been executed.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** ATTEND-006 passed **55/55** focused assertions both in rollback replay and against the applied disposable schema. Seven adjacent notification, swap, attendance, correction, tenant and audit files passed **440/440** assertions. A scheduled worker invocation succeeded; creation of a real scheduled alert has not yet been verified. The preceding QR feature passed **62/62** focused pgTAP, five authenticated integrations, **8/8** Node checks, changed-file ESLint and TypeScript, a split production build and **3/3** browser scenarios.
- **Tests intentionally deferred:** The follow-up notification migration, live scheduled alert creation, authenticated concurrency/tenant tests and alert browser coverage remain. Full repository suites were not rerun; broader migration/security regression remains appropriate at workstream merge or release.
- **Remaining verification risks:** Scheduler alert creation, worker concurrency, new per-user notification behavior and the user interface remain unverified. A QR code can be relayed within its lifetime and does not prove presence. ORG-006 and external delivery remain Blocked.
- **Documentation:** No ATTEND-006 user-visible behavior is implemented yet; update the user guide with actual tested behavior before completion. BRAND planning has no customer-facing behavior.
- **Failing tests:** None in the latest completed selected runs. Earlier anonymous-fragment, kiosk/session-sync, selector and immutable-event expectation failures were corrected. The initial replay role-switch attempt failed; the corrected rollback replay passed.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Run the follow-up migration and expanded database tests in a rolled-back transaction, then implement scoped management and notification screens and verify real scheduled alert creation and concurrent actions.
- **Latest development commit:** `4a325d9bc68fb9a64afcfeeedee287f597b871fd`
- **Push outcome:** Acceptance-replay checkpoint `739f626644d3e0f4a9f57612df5ec9cda08f34c7` was pushed and its remote SHA matched. This status update and the development files are not yet committed.
- **Backlog:** 122 total; 49 Done, 1 In Progress, 6 Blocked, 66 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

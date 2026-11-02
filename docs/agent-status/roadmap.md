# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 18:23 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ATTEND-006 — Late, missing and no-show alerts` (In Progress)
- **Acceptance criteria:** Configurable thresholds; duplicate alerts suppressed; acknowledgement and resolution auditable; unpublished shifts excluded.
- **Phase:** Testing
- **Current activity:** Preparing the split production build and serialized browser acceptance for the owner, manager and notification workflow.
- **Progress since previous report:** The corrected authenticated integration passed, including real cron-created alerts, scoped notifications, concurrent retries and decisions, membership revocation, clock/scan timing, shift publication and policy locking. The synthetic monitoring policy was disabled during cleanup. Added a mobile browser scenario; it has not yet run. Development changes remain uncommitted.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Expanded ATTEND-006 pgTAP passed **66/66** in rollback preflight and against the applied schema; five adjacent notification, swap, tenant and audit files passed **285/285**. Focused alert, kiosk-helper and audit Node tests passed **12/12**; changed-file ESLint and TypeScript passed. The corrected authenticated scheduler/race/tenant integration passed **1/1** after the earlier timing-expectation failure.
- **Tests intentionally deferred:** Production build and alert browser coverage remain. Full repository suites were not rerun; broader migration/security regression remains appropriate at workstream merge or release.
- **Remaining verification risks:** The user interface has not passed a browser walkthrough. A scan evaluates attendance as of its start, so a later clock requires a subsequent scan; document the delay. A QR code can be relayed within its lifetime and does not prove presence. ORG-006 and external delivery remain Blocked.
- **Documentation:** ATTEND-006 user guidance is pending browser verification of the newly implemented workflow. BRAND planning has no customer-facing behavior.
- **Failing tests:** None in the latest completed selected runs. The first alert integration incorrectly expected a clock recorded after scan start in the same scan; its revised test checked that boundary and the next scan and passed. Earlier anonymous-fragment, kiosk/session-sync, selector and immutable-event expectation failures were corrected.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Run the split production build and serialized focused browser scenarios, fix failures and then update the user guide and criterion evidence.
- **Latest development commit:** `4a325d9bc68fb9a64afcfeeedee287f597b871fd`
- **Push outcome:** Scheduler-investigation checkpoint `5a5c067a2a9223db66cff1d6b6e86f8969e2d116` was pushed and its remote SHA matched. This status update and the development files are not yet committed.
- **Backlog:** 122 total; 49 Done, 1 In Progress, 6 Blocked, 66 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

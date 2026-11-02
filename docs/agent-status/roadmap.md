# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 17:54 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ATTEND-004 — Rotating QR kiosk` (Done; feature checkpoint pending)
- **Acceptance criteria:** QR is venue-bound, signed and expires; replay is denied; access to kiosk display is controlled; clocks are validated server-side.
- **Phase:** Complete
- **Current activity:** Recording criterion evidence and preparing a reviewed feature commit, followed by the requested BRAND backlog planning.
- **Progress since previous report:** Reviewed the recovered migration, UI, tests and guide. All four QR acceptance criteria now have passing targeted evidence. The latest invalid-link browser assertion and role-based documentation are verified. The applied disposable migration must not be edited in place.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** After recovery, QR pgTAP passed **62/62**, five authenticated QR/attendance/location/tenant concurrency integrations passed, kiosk/audit Node tests passed **8/8**, and changed-file ESLint (24 files) and TypeScript passed. A split production build and **3/3** serialized browser scenarios passed, including decoded QR, mobile accessibility, invalid-link handling and two session regressions. Previous ordered replay passed **62/62** and seven neighboring files passed **367/367**.
- **Tests intentionally deferred:** Full repository Node, database, integration and browser suites were not rerun. Broader migration/security regression remains appropriate at workstream merge or release.
- **Remaining verification risks:** A code can be relayed within its short lifetime and is not proof of physical presence; production kiosk use requires a secure connection. ORG-006 and external delivery remain Blocked. SAAS-003 does not establish isolated demo infrastructure or production provenance.
- **Documentation:** Updated `docs/USER_GUIDE.md` with tested owner and employee QR instructions, failure cases and limitations; the partial planning-week guidance is retained.
- **Failing tests:** None in the latest completed selected runs. Earlier anonymous-fragment, kiosk/session-sync, selector and immutable-event expectation failures were corrected. The initial replay role-switch attempt failed; the corrected rollback replay passed.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Review and commit the exact QR feature diff, push and verify the remote SHA; then add the requested BRAND epic without claiming that assets are approved or present, and select the next ready core story.
- **Latest development commit:** `306efc428b01e9e69fcb2da78302352c383b041d`
- **Push outcome:** Recovery checkpoint `d8e9229ce4951aa226707cf372f20bf2fa87715f` was pushed and its remote SHA matched. This feature and status update are not yet committed or pushed.
- **Backlog:** 112 total; 49 Done, 0 In Progress, 6 Blocked, 57 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

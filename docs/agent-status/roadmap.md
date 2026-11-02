# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 17:50 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ATTEND-004 — Rotating QR kiosk` (In Progress)
- **Acceptance criteria:** QR is venue-bound, signed and expires; replay is denied; access to kiosk display is controlled; clocks are validated server-side.
- **Phase:** Testing
- **Current activity:** Reviewing recovered QR code and the role-based guide, then rerunning the outstanding invalid-link browser, focused tests and quality checks.
- **Progress since previous report:** Recovered the uncommitted QR implementation and guide without modification. The branch and fetched remote matched `025ec1f166fd3814087c47ec0736f365c06ada4d`. The disposable acceptance database is healthy and records the QR migration; its applied migration must not be edited in place.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** In the previous session, QR pgTAP passed **62/62** on the applied migration and **62/62** in ordered rollback replay; seven neighboring files passed **367/367**. Five authenticated integrations, **8/8** kiosk/audit Node tests, the expanded QR browser scenario and two session regressions passed. Split production build and earlier lint/type checks passed. No tests have yet run since this recovery.
- **Tests intentionally deferred:** Final lint/type checks and the latest added invalid-link browser assertion remain outstanding. Full repository suites were deferred for the prior partial slice.
- **Remaining verification risks:** The latest invalid-link browser assertion and final review have not been rerun. A code can be relayed within its short lifetime and is not proof of physical presence. ORG-006 and external delivery remain Blocked. SAAS-003 does not establish isolated demo infrastructure or production provenance.
- **Documentation:** A role-based QR guide update is present but uncommitted; verify its wording against the recovered UI and browser tests before the feature checkpoint.
- **Failing tests:** None in the latest completed selected runs. Earlier anonymous-fragment, kiosk/session-sync, selector and immutable-event expectation failures were corrected. The initial replay role-switch attempt failed; the corrected rollback replay passed.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Review the QR migration and UI, run final focused browser, lint, type and unit checks, and update criterion evidence. Do not edit the applied migration; use a forward migration if needed. The requested BRAND epic is not yet in the backlog and will be added without claiming that assets are approved or present.
- **Latest development commit:** `306efc428b01e9e69fcb2da78302352c383b041d`
- **Push outcome:** The recovered checkpoint `025ec1f166fd3814087c47ec0736f365c06ada4d` matched the fetched remote SHA. This status update is pending; QR development files remain uncommitted.
- **Backlog:** 112 total; 48 Done, 1 In Progress, 6 Blocked, 57 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

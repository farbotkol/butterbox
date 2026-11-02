# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 12:50 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ATTEND-004 — Rotating QR kiosk` (In Progress)
- **Acceptance criteria:** QR is venue-bound, signed and expires; replay is denied; access to kiosk display is controlled; clocks are validated server-side.
- **Phase:** Debugging
- **Current activity:** Fixing the interaction between cross-tab account session announcements and the independent kiosk device session.
- **Progress since previous report:** The split production compile/type/generate build passed. A first browser run found an ambiguous test selector, now corrected. The second showed a separate anonymous tab's session-end broadcast redirecting the activated kiosk to login. Status checkpoint `0c474a71170dd9c4d318c3ccd88b3814f21048ac` was pushed with matching remote SHA; development changes remain uncommitted.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** QR pgTAP passed **62/62** on both rolled-back preflight and applied migration; seven neighboring attendance, geofence, audit and tenant files passed **367/367**. Five authenticated integration scenarios and **8/8** kiosk/audit Node tests passed. Split production build and earlier changed-file lint/type checks passed. The QR browser scenario currently fails on the session-sync defect; full acceptance has not passed.
- **Tests intentionally deferred:** Corrected QR browser, cross-tab session regression, final accessibility and final lint/type checks remain outstanding. Full repository suites were deferred for the prior partial slice.
- **Remaining verification risks:** QR UI is not yet browser-verified; a code can be relayed within its short lifetime and is not proof of physical presence. ORG-006 and external delivery remain Blocked. SAAS-003 does not establish isolated demo infrastructure or production provenance.
- **Documentation:** Pending. Update the role-based user guide after UI wording and behavior are implemented and verified.
- **Failing tests:** QR browser scenario fails because an unrelated session-end notification redirects the kiosk to login. The first run's ambiguous alert selector was corrected; the initial disk-guard invocation also required `bash` because the session helper is not executable.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Correct kiosk handling of account session-end broadcasts, then rerun the QR browser and existing cross-tab logout scenarios. Do not edit the applied migration; use a forward migration if needed. Await the separate security review.
- **Latest development commit:** `306efc428b01e9e69fcb2da78302352c383b041d`
- **Push outcome:** Checkpoint `0c474a71170dd9c4d318c3ccd88b3814f21048ac` was pushed with matching remote SHA. This status checkpoint is pending; QR development files remain uncommitted.
- **Backlog:** 112 total; 48 Done, 1 In Progress, 6 Blocked, 57 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

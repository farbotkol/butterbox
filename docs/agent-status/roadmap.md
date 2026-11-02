# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 12:59 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ATTEND-004 — Rotating QR kiosk` (In Progress)
- **Acceptance criteria:** QR is venue-bound, signed and expires; replay is denied; access to kiosk display is controlled; clocks are validated server-side.
- **Phase:** Testing
- **Current activity:** Completing user guidance and final focused quality and browser checks.
- **Progress since previous report:** Ordered migrations through the QR schema were rehearsed in a rolled-back transaction on the separately verified replay project; QR pgTAP passed **62/62** and the replay left no helper or tables behind. An initial role-switch attempt failed and was corrected by connecting as the verified local administrator. The previous checkpoint `f2a053129c7460161eb1017abc0ee36bf4c27ea6` was pushed with matching remote SHA; development changes remain uncommitted.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** QR pgTAP passed **62/62** on the applied migration and **62/62** in ordered rollback replay; seven neighboring attendance, geofence, audit and tenant files passed **367/367**. Five authenticated integrations and **8/8** kiosk/audit Node tests passed. The expanded QR browser scenario passed after the fragment fix; two cross-tab session regressions passed in the prior selection. Split production build and earlier changed-file lint/type checks passed.
- **Tests intentionally deferred:** Final lint/type checks and the latest added invalid-link browser assertion remain outstanding. Full repository suites were deferred for the prior partial slice.
- **Remaining verification risks:** QR UI is not yet browser-verified; a code can be relayed within its short lifetime and is not proof of physical presence. ORG-006 and external delivery remain Blocked. SAAS-003 does not establish isolated demo infrastructure or production provenance.
- **Documentation:** Pending. Update the role-based user guide after UI wording and behavior are implemented and verified.
- **Failing tests:** None in the latest completed selected runs. Earlier anonymous-fragment, kiosk/session-sync, selector and immutable-event expectation failures were corrected. The initial replay role-switch attempt failed; the corrected rollback replay passed.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Finish the role-based guide and criterion evidence, then run final focused browser, lint, type and unit checks. Do not edit the applied migration; use a forward migration if needed. Await private owner/security review of the historical findings.
- **Latest development commit:** `306efc428b01e9e69fcb2da78302352c383b041d`
- **Push outcome:** Checkpoint `f2a053129c7460161eb1017abc0ee36bf4c27ea6` was pushed with matching remote SHA. This status checkpoint is pending; QR development files remain uncommitted.
- **Backlog:** 112 total; 48 Done, 1 In Progress, 6 Blocked, 57 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

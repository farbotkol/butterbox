# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 12:55 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ATTEND-004 — Rotating QR kiosk` (In Progress)
- **Acceptance criteria:** QR is venue-bound, signed and expires; replay is denied; access to kiosk display is controlled; clocks are validated server-side.
- **Phase:** Debugging
- **Current activity:** Correcting QR fragment cleanup for anonymous redirects and denied scans.
- **Progress since previous report:** An expanded negative-path browser check found that a scanned code remains in the login URL fragment after an unsigned-in scan. The previous checkpoint `ed1dafea03ef96ae974f06ce8aa7f02190424760` was pushed with matching remote SHA; development changes remain uncommitted.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** QR pgTAP passed **62/62** on both rolled-back preflight and applied migration; seven neighboring attendance, geofence, audit and tenant files passed **367/367**. Five authenticated integrations and **8/8** kiosk/audit Node tests passed. The previous production-browser selection passed **3/3**, but the expanded QR scenario now fails its anonymous-fragment cleanup assertion. Split production build and earlier changed-file lint/type checks passed.
- **Tests intentionally deferred:** Final lint/type checks and migration compatibility review remain outstanding. Full repository suites were deferred for the prior partial slice.
- **Remaining verification risks:** QR UI is not yet browser-verified; a code can be relayed within its short lifetime and is not proof of physical presence. ORG-006 and external delivery remain Blocked. SAAS-003 does not establish isolated demo infrastructure or production provenance.
- **Documentation:** Pending. Update the role-based user guide after UI wording and behavior are implemented and verified.
- **Failing tests:** The expanded QR browser scenario fails because an anonymous scan leaves the QR fragment on the login URL. Earlier selector, kiosk/session-sync and immutable-event expectation issues were corrected before the earlier **3/3** pass.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Remove fragments on anonymous redirects and denied QR pages, then rerun the expanded browser scenario and final checks. Do not edit the applied migration; use a forward migration if needed. Await private owner/security review of the historical findings.
- **Latest development commit:** `306efc428b01e9e69fcb2da78302352c383b041d`
- **Push outcome:** Checkpoint `ed1dafea03ef96ae974f06ce8aa7f02190424760` was pushed with matching remote SHA. This status checkpoint is pending; QR development files remain uncommitted.
- **Backlog:** 112 total; 48 Done, 1 In Progress, 6 Blocked, 57 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

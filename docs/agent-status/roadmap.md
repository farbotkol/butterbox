# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 12:45 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ATTEND-004 — Rotating QR kiosk` (In Progress)
- **Acceptance criteria:** QR is venue-bound, signed and expires; replay is denied; access to kiosk display is controlled; clocks are validated server-side.
- **Phase:** Testing
- **Current activity:** Creating serialized production-browser and mobile/accessibility checks of kiosk activation, actual rendered QR decoding, clocking and revocation.
- **Progress since previous report:** Five authenticated QR/attendance/location/tenant concurrency integrations passed. The previous push was rejected because owner branding documentation advanced the branch; that independent commit was merged without discarding local work, and merge checkpoint `1171544b4c16dff09084d88a59616c5673b398b3` was pushed with matching remote SHA. Development changes remain uncommitted.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** QR pgTAP passed **62/62** on both rolled-back preflight and applied migration; seven neighboring attendance, geofence, audit and tenant files passed **367/367** on the applied schema. Five authenticated integration scenarios passed, including concurrent activation, competing workers, exact retries, cross-tenant denial and access changes. Kiosk/audit Node tests passed **8/8**; earlier changed-file ESLint and TypeScript passed. Prior ORG-006 applied/replay pgTAP each passed **62/62** and **3/3** browser scenarios passed.
- **Tests intentionally deferred:** QR browser, accessibility, build and final lint/type checks have not yet run. Full repository suites were deferred for the prior partial slice.
- **Remaining verification risks:** QR UI is not yet browser-verified; a code can be relayed within its short lifetime and is not proof of physical presence. ORG-006 and external delivery remain Blocked. SAAS-003 does not establish isolated demo infrastructure or production provenance.
- **Documentation:** Pending. Update the role-based user guide after UI wording and behavior are implemented and verified.
- **Failing tests:** None in the current selected runs. An initial package command produced an invalid nested dependency entry and initial lint runs found React lifecycle errors; both were corrected and the affected checks passed.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Run the production build and serialized browser/mobile flows using rendered QR decoding. Do not edit the applied migration; use a forward migration if needed. Await the separate security review.
- **Latest development commit:** `306efc428b01e9e69fcb2da78302352c383b041d`
- **Push outcome:** A push was rejected after the remote advanced; the independent owner branding commit was merged and checkpoint `1171544b4c16dff09084d88a59616c5673b398b3` was pushed with matching remote SHA. This status checkpoint is pending; QR development files remain uncommitted.
- **Backlog:** 112 total; 48 Done, 1 In Progress, 6 Blocked, 57 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

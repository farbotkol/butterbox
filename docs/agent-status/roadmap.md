# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 12:40 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ATTEND-004 — Rotating QR kiosk` (In Progress)
- **Acceptance criteria:** QR is venue-bound, signed and expires; replay is denied; access to kiosk display is controlled; clocks are validated server-side.
- **Phase:** Testing
- **Current activity:** Verifying the newly written kiosk/device and employee UI, preserving the existing attendance and geofence state machines.
- **Progress since previous report:** Expanded the rollback-only preflight to **62/62** and applied migration `20261103160000` through the local CLI only to the verified disposable `butterbox-acceptance` project (API 55421, DB 55422). The ledger confirms it. Documentation checkpoint `ad340cfa6204fc536f24577fa347211be722e3d8` was pushed with matching remote SHA; development changes remain uncommitted.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** QR database rollback preflight passed **62/62**, including signature tampering, activation expiry, replay, tenant/venue scope, authorization, breaks, timestamp, geofence and revocation. Kiosk/audit Node tests passed **8/8**; changed-file ESLint and TypeScript passed. Prior ORG-006 applied/replay pgTAP each passed **62/62** and **3/3** browser scenarios passed.
- **Tests intentionally deferred:** QR concurrency, applied-migration checks, authenticated integration, browser, accessibility and build have not yet run. Full repository suites were deferred for the prior partial slice.
- **Remaining verification risks:** QR UI is not yet browser-verified; a code can be relayed within its short lifetime and is not proof of physical presence. ORG-006 and external delivery remain Blocked. SAAS-003 does not establish isolated demo infrastructure or production provenance.
- **Documentation:** Pending. Update the role-based user guide after UI wording and behavior are implemented and verified.
- **Failing tests:** None in the current selected runs. An initial package command produced an invalid nested dependency entry and initial lint runs found React lifecycle errors; both were corrected and the affected checks passed.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Run the applied-schema QR, neighboring attendance/tenant and authenticated concurrency tests, then build and test browser/mobile flows. Do not edit the applied migration; use a forward migration if needed. Await the separate security review.
- **Latest development commit:** `306efc428b01e9e69fcb2da78302352c383b041d`
- **Push outcome:** Checkpoint `ad340cfa6204fc536f24577fa347211be722e3d8` was pushed with matching remote SHA. This status checkpoint is pending; QR development files remain uncommitted.
- **Backlog:** 112 total; 48 Done, 1 In Progress, 6 Blocked, 57 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

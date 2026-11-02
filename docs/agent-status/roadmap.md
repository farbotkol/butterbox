# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 12:29 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-ATTEND-004 — Rotating QR kiosk` (In Progress)
- **Acceptance criteria:** QR is venue-bound, signed and expires; replay is denied; access to kiosk display is controlled; clocks are validated server-side.
- **Phase:** Coding
- **Current activity:** Implementing the device and employee UI around an uncommitted kiosk transaction migration; the existing attendance and geofence state machines remain authoritative.
- **Progress since previous report:** Drafted owner-controlled device activation, signed 45-second venue codes, atomic one-use clock consumption and immutable consumed-code links. The migration was preflighted in a rolled-back transaction, not applied. Story-start documentation checkpoint `77840d9bb3cba1acad176119971f743face21dfa` was pushed with matching remote SHA.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** QR database rollback preflight passed **55/55**, covering signature tampering, expiry, replay, tenant/venue scope, authorization, timestamp, geofence and revocation. Prior ORG-006 applied and replay pgTAP each passed **62/62**; six neighboring files passed **327/327**; concurrency integration **1/1**, Node **5/5**, lint, TypeScript, split build and **3/3** browser scenarios passed.
- **Tests intentionally deferred:** QR concurrency, applied-migration checks, authenticated integration, UI, browser, accessibility, lint, type-check and build have not yet run. Full repository suites were deferred for the prior partial slice.
- **Remaining verification risks:** QR UI is not implemented; a code can be relayed within its short lifetime and is not proof of physical presence. ORG-006 and external delivery remain Blocked. SAAS-003 does not establish isolated demo infrastructure or production provenance.
- **Failing tests:** None in the current QR preflight or final selected ORG-006 runs.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention and recovery remain unverified; ORG-006 external delivery decisions remain outstanding; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 requires production assessment and a separate demo environment. PAY-004 remains deferred.
- **Next concrete action:** Implement the restricted device activation/display and employee QR clock path; extend attendance and race tests before safely applying the migration. Await the separate security review.
- **Latest development commit:** `306efc428b01e9e69fcb2da78302352c383b041d`
- **Push outcome:** Story-start checkpoint `77840d9bb3cba1acad176119971f743face21dfa` was pushed and matched the remote SHA; this status checkpoint and unverified QR code are not yet committed.
- **Backlog:** 109 total; 48 Done, 1 In Progress, 6 Blocked, 54 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

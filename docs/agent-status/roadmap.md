# Roadmap Agent — Activity Status

## Local showcase setup checkpoint

- **Last report:** 2026-11-03 12:05 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current work:** User-directed BB-DEMO-001 operator setup and test-owner option; the completed story is not being reopened.
- **Criteria:** A separately verified internal-only showcase, 12–15 fictional FOH/BOH staff and realistic sample workflows, no production data, real messaging or live payroll, and guarded reset; the designated login must be test-only and scoped to the isolated project.
- **Phase:** Testing.
- **Activity:** Preparing to rebuild the showcase with a distinct authentication-cookie namespace across server, proxy, browser and offline session handling.
- **Progress since previous report:** Cloning the snapshot dependencies fixed the initial build failure. The app is running and five real owner, manager and employee browser journeys passed after installing the missing Chromium runtime. A new browser check reproduced a shared-cookie collision between the two local ports; a scoped fix has been implemented.
- **Tests and results:** 24/24 focused showcase/offline unit tests, 2/2 live integration runs, isolated reset/reseed, the production build, five pre-fix browser journeys, changed-code ESLint, TypeScript and diff checks passed. The new cookie-preservation browser test failed against the pre-fix build as expected; the rebuilt app and regression tests remain pending.
- **Failing tests:** The reproduced cookie-collision baseline fails on the old build; verification of the fix has not yet run.
- **Blockers/risks:** The currently running showcase build still uses the old cookie namespace until rebuilt. The brand, hosted-review and production gates below remain unchanged.
- **Documentation:** Draft operator and user-guide updates added; verify against the resulting workflow.
- **Next concrete action:** Rebuild the isolated app, rerun the cookie-preservation and scoped browser journeys, and confirm the original workspace remains available.
- **Latest development commit:** `20742da5d9f6b5baf2096607e79330e330022cc9`; branch head at observation was status-only `7fb47049b82f6d21a923dec67d52afd7faa284dc`.
- **Push outcome:** Status-only checkpoint `c8adf4a77522c7bc95a7d8371745282425ed078d` was pushed and its remote SHA verified; this update has not yet been pushed.

The prior Roadmap planning and brand blocker remain below; their current execution state is not verified by this local checkpoint.

---

- **Last report:** 2026-11-03 00:32 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent; Core Roadmap on `copilot/finish-roadmap-for-app`
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Owner-directed brand work (BB-BRAND-002–005): Blocked — missing source.** At 2026-11-03 00:32 UTC, the owner asked to implement the approved Coastal Wave identity from `branding/originals/butterbox-coastal-wave-approved-reference.png`. That file and `branding/originals/` do **not** exist in the working tree, any fetched remote branch or Git history (`git log --all -- 'branding/originals/*'` returned none). The image was not inspected, no logo was vectorized and existing draft SVGs were not substituted. `ASSET_INDEX.csv` was not changed because it must not record an unverified binary as present. BB-DEMO-003/004 depend on BRAND-002 and remain blocked. **Needed:** commit or upload the PNG at that path. Next: verify, hash and inspect it, then run BRAND-002→005.
- **Current story (paused for owner priority):** BB-REPORT-002 — Overtime and exceptions report (In Progress)
- **Phase:** Blocked (brand); REPORT-002 Planning
- **Criteria:** Summarize overlaps, excessive hours and missing clock events; drill down to sources; do not infer award breaches without verified rules.
- **Activity:** Inspect existing scoped reporting, overlap, attendance and shared-worker primitives before implementation.
- **Progress since previous report:** Selected ready Showcase P1 REPORT-002. The user was unavailable for threshold questions and requested a pragmatic choice: use a user-entered non-statutory threshold without a fixed default, with scheduled and approved-worked hours separate. No legal/payroll assumption is approved.
- **Tests and results:** No REPORT-002 tests run yet. Prior ROSTER-011 verification passed 21 Node tests, 190 applied pgTAP assertions, two concurrency tests and four production Chromium scenarios; lint, TypeScript and split build passed.
- **Failing tests:** None known for the completed prior story; the new report has not yet been implemented or tested.
- **Deferred tests:** Full unrelated Node, pgTAP, integration and browser suites; broader release/workstream-merge regression remains required.
- **Risks/blockers:** Cross-scope aggregation and source disclosure must be designed and tested. P0 branding lacks an approved identity; validated employment rules, hosted access and existing security/staging approvals remain outstanding. Prior Firefox/Safari and manual assistive-technology review remain deferred.
- **Documentation:** REPORT-002 guidance pending tested behavior; prior ROSTER-011 guide v1.3 and contextual help were verified.
- **Resources:** The separately identified `butterbox-acceptance` project is running on API 55421 and DB 55422; no reset or migration outside it. Disk has 30 GiB free.
- **Latest development commit:** `20742da5d9f6b5baf2096607e79330e330022cc9` (ROSTER-011).
- **Push outcome:** Selection blocker checkpoint `300fd614208c9959b296a873530c7b8e30af0944` pushed and remote SHA verified.
- **Next concrete action:** Read reporting and attendance/roster permission primitives, choose a tenant-safe data shape and add focused tests before implementation. Preserve the unrelated `.eslintcache` deletion.
- **Backlog:** 127 total; 59 Done, 1 In Progress, 6 Blocked, 61 Backlog.

Criterion evidence: `IMPLEMENTATION_PROGRESS.md`.

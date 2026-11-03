# Roadmap Agent — Activity Status

## Local application refresh checkpoint

- **Last report:** 2026-11-03 12:44 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** Complete at this checkpoint; the local apps remain running, with no background scheduling claim.
- **Current work:** User-directed refresh of the ordinary app and existing BB-DEMO-001 showcase; no story status changed.
- **Criteria:** Load the latest branch code in both local apps while preserving the isolated showcase, its owner login and all existing data.
- **Phase:** Complete.
- **Activity:** Delivered the Coastal Wave integration from development commit `6d5c4e7a4a33324d1c1100d628298bd936588e77` to both loopback apps.
- **Progress since previous report:** Fast-forwarded the branch, verified the development app's hot update, built the showcase in a separate private snapshot, browser-tested the preview and gracefully replaced only the old showcase app. No database migration or reset was needed.
- **Tests and results:** Showcase split production build and TypeScript passed; desktop/mobile login and logo checks passed for the ordinary app and showcase preview. The live showcase owner signed in, saw 14 fictional staff, verified cookie isolation and reloaded the roster. Both live apps served the new manifest and exact icon bytes; health, six-service isolation and read-only pre/post database counts passed.
- **Failing tests:** None known for this refresh.
- **Blockers/risks:** No local refresh blocker. The showcase remains internal-only and simulated; hosted access, final brand review and production/release regression remain separate.
- **Documentation:** Not applicable — this was an operational refresh of existing upstream changes; the updated User Guide was bundled and verified.
- **Next concrete action:** Refresh the open browser tabs to load the updated apps; resume roadmap story selection separately.
- **Latest development commit:** `6d5c4e7a4a33324d1c1100d628298bd936588e77` (brand integration).
- **Push outcome:** Upstream development commit `6d5c4e7a4a33324d1c1100d628298bd936588e77` was fetched and verified; this status checkpoint is pending.
- **Backlog:** 127 total; 62 Done, 1 In Progress, 7 Blocked, 57 Backlog.

## Local showcase setup checkpoint

- **Last report:** 2026-11-03 12:15 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current work:** User-directed BB-DEMO-001 operator setup and test-owner option; the completed story is not being reopened.
- **Criteria:** A separately verified internal-only showcase, 12–15 fictional FOH/BOH staff and realistic sample workflows, no production data, real messaging or live payroll, and guarded reset; the designated login must be test-only and scoped to the isolated project.
- **Phase:** Complete.
- **Activity:** Delivering the running isolated local showcase and its private owner-login handoff.
- **Progress since previous report:** Committed and pushed the verified source, tests and documentation; confirmed the private login matches the requested showcase owner. Both app login pages returned HTTP 200 on loopback, the running guide matches source, and the final six-service isolation check passed.
- **Tests and results:** 35/35 focused Node tests, 3/3 live integration runs, 7/7 production Chromium scenarios, a reciprocal ordinary-app session check, guarded isolated reset/reseed, production build, changed-code ESLint, TypeScript and diff checks passed. The old-build cookie collision passed after the fix. Final read-only ordinary-project counts remained 1 account, 1 business, 1 venue, 2 departments, 0 employees and 2 shifts; demo seeding remained disabled.
- **Failing tests:** None known for this local setup.
- **Blockers/risks:** The operator must confirm the designated alias is test-only. Hosted access, production/release regression, award compliance and final brand gates are not established by this setup. A concurrent branding commit arrived after the historical blocker below; its current approval status was not verified here.
- **Documentation:** README and user guide updated for test-owner isolation, separate passwords, reset and operator responsibilities; acceptance evidence recorded in implementation progress.
- **Next concrete action:** The operator can sign into the showcase with the separate generated owner password. When Roadmap work resumes, reassess current branding evidence and select the next ready story; BB-REPORT-002 remains In Progress.
- **Latest development commit:** `0f8c847aaa089baaed754a3cd059cb1644afa13c` (isolated showcase test-owner login and session separation).
- **Push outcome:** Development commit `0f8c847aaa089baaed754a3cd059cb1644afa13c` was pushed and its remote SHA verified; this status checkpoint is pending.

The prior Roadmap planning and brand blocker remain below; their current execution state is not verified by this local checkpoint.

---

- **Last report:** 2026-11-03 01:51 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent; Core Roadmap on `copilot/finish-roadmap-for-app`
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current story:** BB-DEMO-004 — Repeatable showcase acceptance and reset: **Blocked (prepared)**. Criteria: documented restricted access and role accounts; automated core-journey and tenant-isolation smoke tests; verified reset; repeatable synthetic data; logged gaps and failure states; no production secrets, live payroll or messaging; owner review evidence.
- **Phase:** Blocked.
- **Progress since previous report:**
  - BB-DEMO-003 Done and pushed in `0181177` (grouped scrollable desktop navigation, accessible mobile **Menu**, owner/admin **Payroll** link, tagline header, dashboard concept labels; 5/5 targeted production browser tests; help upkeep 9/9).
  - DEMO-004: the owner was unavailable for the run-vs-prepare decision, so the live showcase was left untouched. Added the README repeatable acceptance checklist (verify → reset → reseed → fixture/tenant integration → showcase browser spec → record), a failure-mode table, known gaps, a User Guide reviewer note and a pending owner-review record.
- **Tests and results:** Documentation only for DEMO-004; `tests/help.test.mjs` 9/9 passed. No showcase reset, integration or browser run was performed.
- **Failing tests:** None known.
- **Blockers requiring intervention:**
  - **Operator:** stop the review app and run README checklist steps 1–5 on the current commit (this also runs the DEMO-003-adapted `tests/e2e/showcase.spec.mjs`), then record results.
  - **Owner:** review the showcase and record the outcome; final visual review of the Coastal Wave logo system.
  - BRAND-004 needs licensed coastal café photography.
- **Documentation:** updated — README acceptance checklist, User Guide reviewer note, progress evidence.
- **Latest development commit:** `0181177ece06b2f40afd8f360b505dc60758e9e3` (DEMO-003); DEMO-004 documentation commit follows this report.
- **Next concrete action:** With all ready P0 showcase work Done or Blocked, resume the paused P1 BB-REPORT-002 (overtime and exceptions report) planning in a later session.
- **Backlog:** 127 total; 62 Done, 1 In Progress, 7 Blocked, 57 Backlog.
- **Preserved:** the `.eslintcache` deletion and the untracked `supabase/migrations/20261103220000_scoped_exceptions_report.sql` (not committed).

Criterion evidence: `IMPLEMENTATION_PROGRESS.md`.

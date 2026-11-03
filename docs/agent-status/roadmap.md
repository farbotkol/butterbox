# Roadmap Agent — Activity Status

## BB-BRAND-004 supplied imagery checkpoint

- **Last report:** 2026-11-03 16:49 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current story:** BB-BRAND-004 — Prepare homepage imagery.
- **Acceptance criteria:** Select approved, rights-cleared imagery and distinguish illustrations from actual screenshots; retain originals and provide responsive optimized formats; supply appropriate alt text; verify desktop/mobile presentation and loading before deployment.
- **Phase:** Testing.
- **Activity:** Documenting the selected image concepts, provenance, asset catalogue and owner-review limitations.
- **Progress since previous report:** Selected hero, team, café operations, terrace and service scenes. Generated 49 AVIF/WebP/JPEG draft crops directly from the preserved PNG sheets, excluding visible collage borders and never enlarging the source. The largest hero is 848 × 371 and the phone crop is 296 × 370; the source does not meet the brief's 3200 × 1800 native hero requirement.
- **Tests and results:** Image integrity, sizes, no-enlargement and measured compression tests **3/3** passed; isolated Chromium preview tests **4/4** passed at 320, 390 and 1440 px, including axe, source selection, loading and JPEG fallback. ESLint passed and regeneration produced identical manifest and preview hashes. Desktop and mobile screenshots were visually inspected. The showcase returned HTTP 200 before work began; it has not been restarted or reset.
- **Failing tests:** None observed. A one-off backlog inspection command could not load an absent optional `csv-parse` package; use the standard-library CSV reader instead.
- **Blockers requiring intervention:** Written final visual selection, applicable usage-rights confirmation and a native-resolution hero remain outstanding; do not claim publication approval. BB-DEMO-004 still awaits owner review.
- **Documentation:** Catalogue, provenance and visual selection summary are being updated; no application workflow has changed.
- **Next concrete action:** Complete the catalogue and owner-review summary, verify their links and hashes, commit the draft library, and then resume the next safe Roadmap story.
- **Latest development commit:** `324e07250ed507eb3dc9c54e4fa0f2821ecd1090` (supplied website imagery).
- **Push outcome:** The initial status checkpoint `549b88c` was pushed and its remote SHA verified; this update is pending.

## Showcase P0 unblock checkpoint (BB-BRAND-004, BB-DEMO-004)

- **Last report:** 2026-11-03 13:49 AEDT (UTC+1100), observed on the local operator's clock.
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current work:** Owner-authorised Showcase P0 unblock. BB-DEMO-004 (repeatable showcase acceptance and reset) and BB-BRAND-004 (homepage imagery).
- **Criteria:** DEMO-004: documented access and role accounts, core-journey and tenant-isolation smoke tests, verified reset, repeatable synthetic data, logged gaps, no production secrets/payroll/messaging, owner review evidence. BRAND-004: approved rights-cleared imagery labelled as illustration, responsive optimised formats with originals kept, alt text, verified mobile/desktop presentation.
- **Phase:** Complete for this session; both stories remain Blocked on owner/rights gates.
- **Activity:** Recorded evidence; committing and pushing.
- **Progress since previous report:** Fast-forwarded to `d2ebe99` (DEMO-003 Done, DEMO-004 checklist). Built and pushed the BRAND-004 imagery library (`dfaf495`). Ran the full DEMO-004 checklist against the positively identified `butterbox-showcase` only: verify, private recovery dump, graceful stop, confirmed reset (receipt `51939669`), reseed, integration, browser suite, restart from a `dfaf495` snapshot and live owner sign-in.
- **Tests and results:** Showcase verify passed (6 containers). Fixture/tenant integration **1/1**. Showcase production Chromium **15/15** (roles, scoped managers, mobile employee, offline, help, cookie isolation, reports, payroll CSV, axe and 375 px overflow). Live owner sign-in at 1440/390 px passed. Imagery harness at 390/1440 px: correct art direction, no overflow, axe 0; ESLint passed on the new script. Post-run showcase counts match the fixture; ordinary project unchanged and demo seeding disabled.
- **Failing tests:** None.
- **Blockers requiring intervention:** **Owner:** personally review the showcase and record the outcome (DEMO-004). **BRAND-004:** the authorised generated coastal imagery files were not found anywhere; supply the originals with their generator/date/usage terms, or licensed photography, plus final visual review.
- **Documentation:** updated — User Guide reviewer note (latest run, new passwords), branding README/guidelines, asset index, progress evidence and owner-review record.
- **Next concrete action:** Owner review of `http://127.0.0.1:3137` using the regenerated private login; then resume the paused P1 BB-REPORT-002.
- **Latest development commit:** `dfaf495484afce88518d334f7acb9ebfb1f725f0` (homepage imagery library); evidence commit follows this report.
- **Push outcome:** `dfaf495` pushed and remote SHA verified; this checkpoint pending.
- **Backlog:** 127 total; 63 Done, 1 In Progress, 8 Blocked, 55 Backlog.

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

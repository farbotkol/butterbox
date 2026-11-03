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

- **Last report:** 2026-11-03 01:48 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent; Core Roadmap on `copilot/finish-roadmap-for-app`
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Current story:** BB-DEMO-003 — Showcase UI, navigation and mobile polish: **Done**. Criteria: audit real screens against brand/accessibility guidance; prioritise roster, employee mobile, attendance, timesheets, payroll and navigation; fix major inconsistencies; verify desktop and mobile flows; no mockups as screenshots.
- **Phase:** Complete; next is Planning for BB-DEMO-004.
- **Progress since previous report:**
  - Brand integration `6d5c4e7` pushed and verified (BRAND-002/003/005 Done; BRAND-004 Blocked on licensed photography; owner final visual review pending).
  - Audited owner, FOH manager and employee screens at 1280 and 375 px on the isolated acceptance project.
  - Fixed clipped owner desktop navigation (grouped, scrollable), replaced the two-link mobile strip with an accessible **Menu**, added an owner/admin **Payroll** link, replaced the off-brand header eyebrow with the tagline, labelled dashboard forecasting/labour/compliance/AI Copilot as **Concept · not yet available** and spaced roster/schedule help links.
- **Tests and results:** 5/5 targeted production Chromium tests passed (new showcase polish audit with axe/overflow per role and viewport, WCAG/keyboard/screen-reader, loading/failure states, hours report at 390 px, personal mobile schedules). Changed-file ESLint, TypeScript and split build passed. The mobile schedule test first timed out because of a test-helper race; fixed and rerun.
- **Failing tests:** None known.
- **Deferred tests:** `tests/e2e/showcase.spec.mjs` was adapted for the mobile **Menu** but needs the operator's live showcase (port 3137), which this agent must not use — **operator: rerun it before the next showcase refresh.** Full browser regression not run.
- **Risks/blockers:** Owner final visual review of the logo system; BRAND-004 photography; trademark/rights clearance not performed.
- **Documentation:** updated — User Guide navigation, payroll link and concept labels; progress evidence recorded.
- **Latest development commit:** the DEMO-003 commit following this report (see `git log`); previous `6d5c4e7`.
- **Next concrete action:** Push and verify, then plan BB-DEMO-004 (restricted access, verified reset, core-journey and tenant-isolation smoke checks, accounts/failure modes/gaps documentation); owner review evidence must come from the owner.
- **Backlog:** 127 total; 62 Done, 1 In Progress, 7 Blocked, 57 Backlog.
- **Preserved:** the `.eslintcache` deletion and the untracked `supabase/migrations/20261103220000_scoped_exceptions_report.sql` (not committed).

Criterion evidence: `IMPLEMENTATION_PROGRESS.md`.

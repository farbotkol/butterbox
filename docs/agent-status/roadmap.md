# Roadmap Agent — Activity Status

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

- **Last report:** 2026-11-03 01:19 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent; Core Roadmap on `copilot/finish-roadmap-for-app`
- **Execution state:** Active at this checkpoint only; no background scheduling claim.
- **Owner-directed brand work: BRAND-002/003/005 Done; BRAND-004 Blocked (partial).** The earlier missing-source blocker is resolved. The supplied reference is `branding/originals/butterbox-approved-logo.png`, not the path named in the request. It was inspected, matches the described Coastal Wave concept and was committed unchanged in `677a33e`. The owner approved the **direction only**; the vectors, icons, guide and artwork await the owner's final visual review.
- **Criteria:** BRAND-002 covers vector masters and variants, approval and rights records, clear space and sizing, and legibility. BRAND-003 covers the guide, examples, contrast, version history and labelling. BRAND-004 needs rights-cleared homepage imagery. BRAND-005 covers sign-in artwork without changing auth.
- **Phase:** Complete (brand); next is Planning for BB-DEMO-003.
- **Progress since previous report:**
  - Traced the reference with potrace (per-colour IoU ≥ 0.9946).
  - Generated 11 SVG masters, PNG derivatives, favicons, PWA/maskable/apple/social icons, artwork WebP/AVIF and the OG image.
  - Centralised `BrandLockup` and wired Next icon conventions and the manifest.
  - Added the sign-in coastal artwork.
  - Wrote `branding/BRAND_GUIDELINES.md` and the 88-row asset catalogue.
  - Updated the README, backlog, progress and User Guide.
  - BB-REPORT-002 is paused (planning only; no code).
- **Tests and results:**
  - Split production build plus 3/3 Chromium scenarios on the isolated `butterbox-acceptance` project, run twice (the second after fast-forwarding to `0f8c847`): signup/recovery, WCAG/keyboard/screen-reader, and failure states.
  - Changed-file ESLint and TypeScript pass.
  - Desktop 1280 and mobile 375 login/signup screenshots show no overflow.
  - Icon and manifest routes return 200.
  - Catalogue integrity: 88/88.
- **Failing tests:** None known.
- **Deferred tests:** Full browser regression, installed-PWA on real devices, Firefox/Safari.
- **Risks/blockers:**
  - BRAND-004 needs licensed coastal café photography, which is missing, and there is no public homepage route.
  - Owner final visual review of the logo system is pending.
  - Trademark and rights clearance have not been performed.
- **Documentation:** updated — brand guide, branding README, asset index and User Guide sign-in note.
- **Latest development commit:** the brand integration commit following this report (see `git log`); branding assets `677a33e`.
- **Next concrete action:** Commit and push the integration, verify the remote SHA, then start BB-DEMO-003 (UI and mobile polish audit). Do not use the operator's showcase project or port 3137.
- **Backlog:** 127 total; 62 Done, 1 In Progress, 7 Blocked, 57 Backlog.
- **Preserved:** the `.eslintcache` deletion and the untracked `supabase/migrations/20261103220000_scoped_exceptions_report.sql` (not committed).

Criterion evidence: `IMPLEMENTATION_PROGRESS.md`.

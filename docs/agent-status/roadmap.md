# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 20:14 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-DEMO-002 — Guided owner, manager and employee showcase journeys` (Done)
- **Acceptance criteria:** Repeatable scoped owner/manager/employee/payroll-prep walkthroughs; setup, people, roster, shifts, attendance, approvals and CSV; accessible steps and real negative/permission paths; unavailable features clearly identified.
- **Phase:** Complete
- **Current activity:** Recording verified owner/payroll, FOH/BOH manager and mobile employee baseline walkthroughs; preparing their safe feature commit.
- **Progress since previous report:** Added tested read-only baseline journeys to the existing User Guide and four production-browser scenarios. Actual owner login/checklist/setup redirect, departments/14 staff, publication/open shifts, approved sample download and correction page passed. Both managers see only their seven staff/approved groups and cannot export/reopen; mobile employee schedule/availability/history and direct timesheet denial passed. Repeated journeys preserved the fixture; 29 GiB free disk.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Four guided production journeys passed (owner 1/1, both managers 2/2, mobile employee 1/1), including actual login/navigation, seeded counts, real sample download, scope/denials and mobile axe/overflow. Post-walkthrough HTTP baseline integrity 1/1; test ESLint zero warnings, TypeScript and split production build passed. Initial owner failures were test selectors/filter assumptions; fixed and rerun. DEMO-001's 31 focused tests, 74 pgTAP, labelled browser and ordinary report/CSV 2/2 remain its prior evidence, not a new full regression.
- **Tests intentionally deferred:** Full unrelated Node, pgTAP, integration and browser suites; hosted reviewer access, owner review and production/conversion acceptance. Broader regression remains required at release/workstream merge.
- **Remaining verification risks:** Standard local database password, trusted-local containment only; no production/shared-host isolation claim. Reviewer port API 403; remote access unverified. Final identity approval outstanding.
- **Documentation:** Updated README operator commands/limitations, role-based User Guide, story criterion table and trackers.
- **Failing tests:** None in final focused runs. Earlier exact-password-label timeout and owner default department filter assumptions corrected; affected cases passed.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention/recovery and ORG-006 external delivery remain unverified; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 still requires production assessment and clean real-customer conversion despite this local demo slice. PAY-004 remains deferred.
- **Next concrete action:** Commit/push the verified journey slice, then independent ready P1 work (DOC-002); remaining Showcase P0 depends on owner-approved identity.
- **Latest development commit:** `30ba109168f449ed9366f0ebbc29ef9712182603` (pushed story-start checkpoint; completed DEMO-001 feature is a984d6c)
- **Push outcome:** Planning checkpoint remote SHA matched; final journey changes are local, awaiting commit.
- **Backlog:** 127 total; 55 Done, 0 In Progress, 6 Blocked, 66 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

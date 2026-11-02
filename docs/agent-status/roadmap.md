# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 19:59 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-DEMO-002 — Guided owner, manager and employee showcase journeys` (In Progress)
- **Acceptance criteria:** Repeatable scoped owner/manager/employee/payroll-prep walkthroughs; setup, people, roster, shifts, attendance, approvals and CSV; accessible steps and real negative/permission paths; unavailable features clearly identified.
- **Phase:** Planning
- **Current activity:** Reusing existing fictional accounts and fixture dates; preparing non-mutating role-based walkthroughs with actual desktop/mobile navigation and permission checks.
- **Progress since previous report:** Desktop/mobile showcase production browser and normal report/CSV regressions passed. Separately exercised the local reviewer launcher: fresh build, health/login HTTP 200, simulation notice and loopback-only port 3137; stopped after verification. Documented private setup/account inventory, reset/archives/locks, owned-volume restart and sample-only exports. All six DEMO-001 criteria pass. Ordinary customer safeguards and unrelated stacks preserved; 29 GiB free disk.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Focused Node/HTTP integration and adjacent canonical/CSV tests 31/31; changed-code ESLint zero warnings and TypeScript passed. Prior focused pgTAP 74/74; actual reset/reseed and owned-volume restart passed. Showcase production browser 1/1 (desktop/mobile axe, overflow, sample row notices, unauthorized report/download); ordinary acceptance report/CSV browsers 2/2 (including exact unchanged normal filename). Both-mode split production builds passed. Guide Done-story coverage (54), relative file links and present-asset hashes verified.
- **Tests intentionally deferred:** Full unrelated Node, pgTAP, integration and browser suites; hosted reviewer access, owner review and production/conversion acceptance. Broader regression remains required at release/workstream merge.
- **Remaining verification risks:** Standard local database password, trusted-local containment only; no production/shared-host isolation claim. Reviewer port API 403; remote access unverified. Final identity approval outstanding.
- **Documentation:** Updated README operator commands/limitations, role-based User Guide, story criterion table and trackers.
- **Failing tests:** None in latest focused run. Earlier login/schema/readiness and platform-specific egress-message failures fixed; evidence retained in progress log.
- **Blockers requiring intervention:** Immediate private owner/security review of the privileged candidates; FOUND-001 remediation/rotation and history changes require separate authorization. RULES-005 legal retention/recovery and ORG-006 external delivery remain unverified; FOUND-008 hosted restore is deferred to pre-production; SAAS-003 still requires production assessment and clean real-customer conversion despite this local demo slice. PAY-004 remains deferred.
- **Next concrete action:** Add guide journeys and targeted actual navigation checks, run the focused showcase browser only, then record each criterion.
- **Latest development commit:** `a984d6c6563cb324cf6c3bcb3c21a67b5e329f91` (completed DEMO-001 feature)
- **Push outcome:** Feature pushed successfully; remote SHA matches exactly. New story planning checkpoint follows.
- **Backlog:** 127 total; 54 Done, 1 In Progress, 6 Blocked, 66 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

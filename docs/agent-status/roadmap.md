# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 09:51 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-005 — Privacy and retention policy`
- **Acceptance criteria:** Point-in-time location by default; document visibility and retention; provide employee access and correction; preserve required employment records.
- **Phase:** Testing
- **Current activity:** Adding focused production-browser coverage for self-only history, pagination, correction links, privacy and mobile accessibility.
- **Progress since previous report:** Targeted location, correction, timekeeping and tenant regressions passed on the disposable acceptance project. History, corrections and location also passed on the separate replay project after supplying its missing `auth.jwt()` helper temporarily inside each rolled-back test transaction. Feature code remains uncommitted.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** Seven directly affected pgTAP files passed **410/410** on acceptance; history, corrections and location passed **174/174** on replay. The temporary replay Auth helper was confirmed absent after rollback. Four focused Node files passed **12/12**; changed-file ESLint and TypeScript passed. Production-browser verification remains.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Privileged business deletion can remove employment records; approved retention/deletion policy and hosted backups remain unverified. Legal guidance lookup timed out; no compliance claim is made. The legacy employment-type field can become stale when a future metadata event takes effect. Broader regression is required for workstream merge or release.
- **Failing tests:** None in the latest focused runs. The first replay attempt failed because its Auth schema lacks `auth.jwt()`; the identical acceptance helper was then supplied only within rolled-back test transactions. An initial acceptance fixture duplicate was also corrected to exercise the real location trigger.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Add a mobile self-service/cross-tenant browser scenario, run the split production build and focused browser checks, then record criterion-level results.
- **Latest development commit:** `43ab17e9b03927f83db530a30f97df20cd58efd6`
- **Push outcome:** Progress checkpoint `bcdeedb7b48d39590e4587393119eac5b67443e2` was pushed; the remote SHA matched. The personal-history feature is uncommitted.
- **Backlog:** 109 total; 46 Done, 1 In Progress, 4 Blocked, 58 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

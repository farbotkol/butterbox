# Roadmap Agent — Activity Status

- **Last report:** 2026-11-02 09:49 UTC, observed from the Codespace clock
- **Reporter:** Executing Roadmap Agent in the Butterbox Codespace
- **Workstream:** Roadmap / Core; `copilot/finish-roadmap-for-app`
- **Agent execution state:** Active at this checkpoint. The timestamp does not prove later execution; no background scheduling is configured.
- **Current story:** `BB-RULES-005 — Privacy and retention policy`
- **Acceptance criteria:** Point-in-time location by default; document visibility and retention; provide employee access and correction; preserve required employment records.
- **Phase:** Testing
- **Current activity:** Running targeted location, correction, timekeeping and tenant regressions before production-browser verification.
- **Progress since previous report:** A self-only paginated event history, correction links and explicit retention/visibility disclosure are implemented. The new read-only RPC passed initial scope, revocation, original/corrected time and location-check tests. Its migration was applied only to the identified disposable acceptance and replay projects; feature code remains uncommitted.
- **Testing policy in effect:** Targeted verification.
- **Tests selected and actual results:** The new history migration and pgTAP fixture passed **20/20** in a rolled-back acceptance transaction. Four focused Node files passed **12/12**; changed-file ESLint and TypeScript passed. Affected database regressions and the new production-browser scenario remain.
- **Tests intentionally deferred:** Full pgTAP, Node, authenticated integration and browser suites. The roster-notification pgTAP attempt on the fresh replay database stopped before assertions because that project's older `auth.users` schema lacks `email_confirmed_at`; the same suite passed 77/77 on the established acceptance database.
- **Remaining verification risks:** Privileged business deletion can remove employment records; approved retention/deletion policy and hosted backups remain unverified. Legal guidance lookup timed out; no compliance claim is made. The legacy employment-type field can become stale when a future metadata event takes effect. Broader regression is required for workstream merge or release.
- **Failing tests:** None in the latest focused runs. An initial test fixture tried to duplicate an automatically created location check; it was corrected to exercise the real location trigger.
- **Blockers requiring owner intervention:** FOUND-001 credential assessment and rotation; FOUND-008 authorised staging restore target; SAAS-003 production/sample-data assessment. PAY-004 Xero is deferred pending explicit owner authorisation.
- **Next concrete action:** Run the affected pgTAP files on acceptance and replay, add a mobile self-service/cross-tenant browser scenario, and build and verify it.
- **Latest development commit:** `43ab17e9b03927f83db530a30f97df20cd58efd6`
- **Push outcome:** Planning checkpoint `18c675250fd21e74536eba6ebaa66c2219ae38b2` was pushed; the remote SHA matched. The personal-history feature is uncommitted.
- **Backlog:** 109 total; 46 Done, 1 In Progress, 4 Blocked, 58 Backlog

Detailed criterion evidence and recovery steps are in `IMPLEMENTATION_PROGRESS.md`.

# Butterbox autonomous controller (Issue #290)

## Scope and safety

The existing hourly controller observes open PRs and an exclusive Git annotated-tag lease. The opt-in autonomous dispatcher runs only when `BUTTERBOX_AUTONOMY_ENABLED=true` (repository Actions variable) and the `COPILOT_AGENT_USER_TOKEN` Actions secret is present. It only runs against `copilot/Development`; it never runs for PRs.

Queue eligibility is strict: a GitHub Issue must be open, contain `## Acceptance criteria`, carry **all three labels** `autonomy-ready`, `p0`, and `dependencies-cleared`, and have no blocked/hold/external indicators. Epic, parent DEV-FACTORY, Xero #268/#270 dependent and existing-PR work is not eligible. Labels are owner authorisation, not AI interpretation. Without explicit labels there is no dispatch.

Before launching, the dispatcher fetches paginated GitHub Issues and open Development PRs plus Copilot task list. It refuses to start if any Development PR or active Copilot task exists. It rechecks live state, atomically acquires the same proven Git ref lease, checks again, then uses GitHub's documented `POST /agents/repos/{owner}/{repo}/tasks` endpoint with `base_ref=copilot/Development` and confirms the returned ID using `GET`. If POST or GET is ambiguous, the lease is **retained** and no automatic retry is attempted.

**Credential requirement:** GitHub Copilot cloud tasks API requires a user-to-server token (fine-grained personal access or GitHub App user token), not the standard Actions `GITHUB_TOKEN`. Store it as a repository Actions secret named `COPILOT_AGENT_USER_TOKEN`. Do not put credentials in issue text or PRs. Confirm minimum GitHub permissions from live docs and owner account before enabling. API is public preview.

**Release gate implemented, not live-tested:** An existing lease is retained unless GitHub's Copilot task detail identifies exactly one matching session marker, the agent and all sessions are completed, a canonical merged PR is linked to the task artifact, the issue is already closed through reconciliation, and no open Development PR remains. The controller releases the lease only then, and selects the next issue on a subsequent scheduled run. If evidence is missing, it retains the lock.\n\n**Not yet operationally proved:** real completed Copilot session and safe release, historical reconciliation fixes, an end-to-end synthetic merge-to-next-issue cycle, and full 12-hour parking/advance. A lease older than 12 hours is reported for review, never forcibly stolen. A lease older than 12 hours is reported as requiring review, not forcibly stolen. A stale lease intentionally prevents any second launch. PR #294 currently remains an open draft and blocks dispatch.

## Validation

Run `node --test tests/delivery-controller-autonomy.test.mjs` plus existing controller policy tests. Complete standard Verify/database CI. Before opt-in, prove no dispatch with the open draft PR, confirm missing-secret behavior and monitor task API authentication permissions. Then perform an owner-approved synthetic task with exact task ID and session state; do not report the full loop complete until merged evidence and safe lease release are shown.

Official API: https://docs.github.com/en/rest/agent-tasks/agent-tasks?apiVersion=2026-03-10

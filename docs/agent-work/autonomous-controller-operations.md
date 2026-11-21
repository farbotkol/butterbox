# Butterbox autonomous controller (Issue #290)

## Scope and safety

The existing hourly controller observes open PRs and an exclusive Git annotated-tag lease. The opt-in autonomous dispatcher runs only when `BUTTERBOX_AUTONOMY_ENABLED=true` (repository Actions variable) and the `COPILOT_AGENT_USER_TOKEN` Actions secret is present. It only runs against `copilot/Development`; it never runs for PRs.

Queue eligibility is strict: a GitHub Issue must be open, contain `## Acceptance criteria`, carry **all three labels** `autonomy-ready`, `p0`, and `dependencies-cleared`, and have no blocked/hold/external indicators. Epic, parent DEV-FACTORY, Xero #268/#270 dependent and existing-PR work is not eligible. The controller verifies that the owner applied each current queue label, checks GitHub's linked blockers for completed closure, and excludes assigned issues.

Before launching, the dispatcher fetches paginated GitHub Issues and open Development PRs plus Copilot task list. It refuses to start if any Development PR or active Copilot task exists. It rechecks live state, atomically acquires the same proven Git ref lease, checks again, then uses GitHub's documented `POST /agents/repos/{owner}/{repo}/tasks` endpoint with `base_ref=copilot/Development` and confirms the returned ID using `GET`. If the final preflight detects a state change before POST, the run releases its unused lease. If POST or GET is ambiguous, the lease is **retained** and no automatic retry is attempted.

**Credential and account eligibility.** GitHub documents the preview task creation endpoint for Copilot Business and Enterprise. General Copilot cloud agent access and the built-in-token Copilot CLI repair workflow have separate eligibility. A GitHub App user access token with repository **Agent tasks** read/write permission is the documented PAT-free option for task creation. The account owner must authorize the app, and the app must have access to this repository. GitHub also documents OAuth app user tokens. The Actions `GITHUB_TOKEN` and GitHub App installation tokens are unsupported for task creation.

Keep the repository variable off while verifying access. Use the approved user credential for a read-only `GET /agents/repos/farbotkol/butterbox/tasks` and confirm the account's Copilot seat and repository policy separately. A successful GET establishes read access only. Keep expiring app credentials and any refresh material in the approved secret store. The current workflow reads `COPILOT_AGENT_USER_TOKEN` and has no token refresh mechanism.

**Lease release.** The controller requires an exact lease marker on a uniquely matched task, completed sessions for that task against Development, a matching GitHub PR artifact, a canonical merged PR, a closed issue and an empty Development PR queue. Missing evidence keeps the lease held. After 12 hours the controller can park a failed, cancelled or timed-out task when all sessions have stopped, GitHub reports no PR artifact, and the Development PR queue is empty. It records the failure and task reference in an annotated parking tag before releasing the lease. The parked issue remains open and is skipped by later runs. To retry it, independently confirm no writer or PR remains, then remove the issue-specific parking tag and review its queue labels. Ambiguous outcomes keep the lease held and are reported for review. Live handoff and parking still need runtime acceptance. PR #294 blocks dispatch while open.

## Validation

Run `node --test tests/delivery-controller-autonomy.test.mjs` plus existing controller policy tests. Complete standard Verify/database CI. Before opt-in, prove no dispatch with the open draft PR, confirm missing-secret behavior and monitor task API authentication permissions. Then perform an owner-approved synthetic task with exact task ID and session state; do not report the full loop complete until merged evidence and safe lease release are shown.

Official API: https://docs.github.com/en/rest/agent-tasks/agent-tasks?apiVersion=2026-03-10

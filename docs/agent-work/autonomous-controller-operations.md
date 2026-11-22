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

## Validate the stored Copilot token from a phone

Use GitHub in your phone's browser with repository write access. The manual workflow
becomes available after its file lands on the default branch, `copilot/Development`.

1. Open [Butterbox Actions](https://github.com/farbotkol/butterbox/actions).
   If the workflow list or **Run workflow** is hidden, use your browser's
   **Request Desktop Website** or **Desktop site** option.
2. Select **Check Copilot agent token**, then **Run workflow**.
3. In the branch picker, select **copilot/Development** and tap **Run workflow** again.
4. Open the new run and read its **Summary**. The job reports the HTTP status from
   GitHub. HTTP 200 confirms task-list access. For 401, check whether the stored
   token is valid and unexpired. For 403, check the app's installation, **Agent
   tasks** permission and Copilot policy. If the secret is unavailable or GitHub
   sends no HTTP response, the summary reports that separately.

This check uses the existing repository Actions secret `COPILOT_AGENT_USER_TOKEN`.
It makes one GET request and discards the response body. Leave
`BUTTERBOX_AUTONOMY_ENABLED` off. Keep Issue #290 open for live acceptance.
See [Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

## One-time synthetic Copilot task for Issue #298

The owner runs this workflow manually after its implementation PR passes CI
and merges to `copilot/Development`. The synthetic uses Issue #298 and asks
Copilot to add one fixed Markdown file. It never changes the unattended
controller switch and has no scheduled trigger. Keep Issue #290 open.

Before launching:

- Wait until [PR #294](https://github.com/farbotkol/butterbox/pull/294) is closed
  through its own development process and no other Development PR, non-idle Copilot
  coding task that may still be writing, repair run, or exclusive lease is active. Leave #294 and its branch
  alone. Avoid starting any parallel coding sessions during the test.
- Confirm the GitHub App is installed only for Butterbox and has **Agent tasks:
  Read and write** for this test. If you originally tested with read-only access,
  update the app, approve the permission change for its installation, obtain a
  fresh GitHub App user access token, and update the existing
  `COPILOT_AGENT_USER_TOKEN` under **Settings → Secrets and variables → Actions**.
  Keep the token private and keep `BUTTERBOX_AUTONOMY_ENABLED` unset or false.
  The earlier HTTP 200 establishes listing access.
- Leave Issue #298 open, unassigned and unlabelled.

### Run from a phone

1. In your phone's browser, open [Butterbox Actions](https://github.com/farbotkol/butterbox/actions)
   while signed in as `farbotkol`. Use **Request Desktop Website** or **Desktop
   site** if the controls are hidden. Select **Controlled Copilot synthetic
   test**, then **Run workflow**.
2. Choose branch **copilot/Development** and operation **launch**. Leave
   **task_id** and **pr_number** empty. In **confirmation**, type **LAUNCH-298**,
   then tap **Run workflow**. Use the run's **Summary** to capture the HTTP 201,
   task ID, independent GET status, session IDs and exclusive lease. If the
   session is still pending, use a new manual **verify** run with the recorded
   **task_id** and leave the PR input empty. Use **verify** for status checks.
3. Once Copilot opens the draft PR and CI finishes, start another manual run on
   Development with **verify**, the same **task_id**, and the draft's numeric
   **pr_number**. Leave **confirmation** empty. Review the file and the exact
   PR head in the Summary. After the verified scope and **verify** and
   **database-smoke** checks pass, use GitHub to mark the draft ready and
   squash-merge through the existing protections. Review the latest checks and
   head again if marking ready starts another CI run or the head changes.
4. Run the workflow again on Development with **reconcile**, the same **task_id**
   and **pr_number**. Leave **confirmation** empty. Its Summary confirms the
   merge, the synthetic issue update and exact lease release. The workflow
   records the task, sessions, PR, checked SHA, merged SHA, and run links on
   Issue #298 before closing it. Check that Issue #290 remains open.

Both workflows ignore other Copilot tasks reported as idle when checking
for competing writers. Queued, in-progress, waiting-for-user, and unrecognized
task states still block. Completion of the task that owns the lease must still
be verified before release. Leave idle sessions alone while a task holds the
lease.

CI repair and Phase 2 automatic merging stand down while the synthetic lease
is held. The owner performs the protected squash merge. A rejection or ambiguous
launch after the one-time intent is recorded deliberately retains the lease and
consumes the launch attempt. Keep the intent and lease refs intact while
investigating. **Verify** and **reconcile** cannot create a second task.

# Butterbox autonomous controller (Issue #290)

## Scope and safety

The existing hourly controller observes open PRs and an exclusive Git annotated-tag lease. The opt-in autonomous dispatcher runs only when `BUTTERBOX_AUTONOMY_ENABLED=true` (repository Actions variable) and the `COPILOT_AGENT_USER_TOKEN` Actions secret is present. It only runs against `copilot/Development`; it never runs for PRs.

Queue eligibility is strict: a GitHub Issue must be open, contain `## Acceptance criteria`, carry **all three labels** `autonomy-ready`, `p0`, and `dependencies-cleared`, and have no blocked/hold/external indicators. Epic, parent DEV-FACTORY, Xero #268/#270 dependent and existing-PR work is not eligible. The controller verifies that the owner applied each current queue label, checks GitHub's linked blockers for completed closure, and excludes assigned issues.

Before launching, the dispatcher fetches paginated GitHub Issues and open Development PRs plus Copilot task list. It refuses to start if any Development PR or active Copilot task exists. It rechecks live state, atomically acquires the same proven Git ref lease, checks again, then uses GitHub's documented `POST /agents/repos/{owner}/{repo}/tasks` endpoint with `base_ref=copilot/Development` and confirms the returned ID using `GET`. If the final preflight detects a state change before POST, the run releases its unused lease. If POST or GET is ambiguous, the lease is **retained** and no automatic retry is attempted.

**Credential and account eligibility.** GitHub documents the preview task creation endpoint for Copilot Business and Enterprise. General Copilot cloud agent access and the built-in-token Copilot CLI repair workflow have separate eligibility. A GitHub App user access token with repository **Agent tasks** read/write permission is the documented PAT-free option for task creation. The account owner must authorize the app, and the app must have access to this repository. GitHub also documents OAuth app user tokens. The Actions `GITHUB_TOKEN` and GitHub App installation tokens are unsupported for task creation.

Keep the repository variable off while verifying access. Use the approved user credential for a read-only `GET /agents/repos/farbotkol/butterbox/tasks` and confirm the account's Copilot seat and repository policy separately. A successful GET establishes read access only. Keep expiring app credentials and any refresh material in the approved secret store. The current workflow reads `COPILOT_AGENT_USER_TOKEN` and has no token refresh mechanism.

**Controlled unattended scope.** The dispatcher only selects #305 and #306.
Each issue permits one fixed Markdown file with exact bytes. The controller
checks the exact lease marker against independently fetched task and session
records, finds the sole GitHub PR artifact, and verifies the session head,
canonical issue and proof markers, and PR diff. It requires the latest
successful GitHub Actions `verify` and `database-smoke` on the same head
before marking a draft ready. On a later run it repeats validation and
requests a native squash merge with GitHub's expected-head guard. GitHub
enforces configured review, conversation and status-check protections.
There is no pending auto-merge request that can run on a later head.

On a subsequent run, the controller confirms GitHub Actions performed the
squash and checks pre-merge CI, the squash parent, merged file and bytes, and
the Development tip. It verifies the issue and approval again. It closes
the issue and appends the audit record in one API call. On restart it verifies
the same audit record and GitHub's closure event before releasing the exact
lease. Only a later run can select another issue. #306 also requires verified
controller closure of #305. Neither manual closure nor parking #305 advances
the pair.

GitHub Actions CI repair and the general Phase 2 merge workflow stand down
while any delivery lease is held. A missing result, another writer or PR,
a moving base, failed CI, or an ambiguous response keeps the lease held.
After 12 hours, a uniquely identified failed, cancelled or timed-out task can
be parked only when all its sessions have stopped, it produced no PR artifact,
and there are no other writers or open Development PRs. Inspect the Actions
summary and leave the lease in place when writer status is uncertain.

**Blockers addressed in #307.** The hourly controller previously deferred all
PR activity for held leases, and the general Phase 2 merge path required a
non-draft PR without independently verifying its task. The handoff waited for
an issue to be closed, but the separate merged-evidence workflow records
comments and expects a human canonical review. It does not close issues.
PR REST details use version `2022-11-28` to obtain `merge_commit_sha`; the
Copilot task API still uses `2026-03-10`. The controlled proof and audit record
apply only to #305 and #306. The separate evidence workflow retains its
existing requirements for other PRs.

## Controlled two-task acceptance from a phone

1. After #307 has passed CI and its PR has been merged, sign in as
   `farbotkol` in your phone's browser and open [Butterbox Actions](https://github.com/farbotkol/butterbox/actions).
   Use **Request Desktop Website** or **Desktop site** if GitHub hides menus.
   Confirm Development has no open PR, active repair or delivery lease.
   Confirm both issues are open and unassigned. Use the token check below
   while the autonomy variable is off.
2. Open [#305](https://github.com/farbotkol/butterbox/issues/305) and then
   [#306](https://github.com/farbotkol/butterbox/issues/306). Use each issue's
   **Labels** control to apply `autonomy-ready`, `p0`, and
   `dependencies-cleared` yourself. The controller checks the actor of the
   latest event for each current label and checks linked blockers. Label both
   issues before enabling the test so the queue demonstrates automatic handoff.
3. Open **Settings → Secrets and variables → Actions → Variables** in the
   [repository settings](https://github.com/farbotkol/butterbox/settings/variables/actions).
   Add or edit the repository variable `BUTTERBOX_AUTONOMY_ENABLED` with
   value `true`. Leave secrets as configured. Select the **Butterbox
   action-based delivery controller (phase 1)** workflow. Wait for the hourly
   schedule, or tap **Run workflow**, choose `copilot/Development` and tap
   **Run workflow** to start the first controller evaluation. Leave subsequent
   transitions and selection to the hourly schedule.
4. In each run's **Summary**, track #305's `LEASE_ACQUIRED`, `COPILOT_LAUNCHED`,
   `PR_READY`, `MERGE_CONFIRMED`, `ISSUE_RECONCILED` and `LEASE_RELEASED`.
   Match the task ID, completed session IDs, PR, exact head SHA, check links,
   squash SHA and proof blob in the closed issue's audit. Open the PR
   **Checks** tab and confirm `verify` and `database-smoke` succeeded on
   that head before merge. The draft promotion, merge and reconciliation
   can occur on separate runs.
5. Confirm #306's `LEASE_ACQUIRED` and independently fetched task appear on
   a later scheduled run after #305's release. Verify #306's own draft,
   exact-head checks, squash, completed closure, evidence and lease release.
   Both issues must have one proof file each. Use the Actions run links
   and timestamps to show the tasks did not overlap.
6. Set the variable back to `false` after both releases or to pause on an
   unexpected result. On a stop, review the exact error and GitHub evidence.
   Leave failed CI, unclear writer status, issue closure and held leases for
   investigation without force-merging, relaunching, or manually releasing a
   lease. Keep #290 open until both autonomous runs meet these criteria.

Before opt-in, run `node --test tests/delivery-controller-*.test.mjs` and
verify `verify` and `database-smoke` on the implementation PR. Local tests
exercise the sequence against simulated GitHub APIs. The scheduled run records
are the evidence of live autonomous acceptance.

Official API: https://docs.github.com/en/rest/agent-tasks/agent-tasks?apiVersion=2026-03-10

## Recover a failed task with a queued session

GitHub's Agent Tasks REST API exposes list, get and start operations. Its task
state is derived from the most recent session. The API does not document that a
`failed` task prevents a session still reported as `queued` from executing,
and it exposes no stop, cancel, or session-state reconciliation endpoint.
An old timestamp, an empty artifact list and the task badge in the UI
are insufficient evidence to clear the writer gate.
[Agent Tasks REST API](https://docs.github.com/en/rest/agent-tasks/agent-tasks?apiVersion=2026-03-10)

1. On your phone, sign in to GitHub in a browser and open the task from the
   controller's `COPILOT_WRITER_BLOCK` log. Use **Request Desktop Website**
   or **Desktop site** if needed. For run
   [45111540786](https://github.com/farbotkol/butterbox/actions/runs/45111540786),
   open [the failed task](https://github.com/farbotkol/butterbox/copilot/tasks/e80f0b14-620a-4914-8dac-f12059f2421f)
   and locate session `5bc5755a-3f75-4017-a460-d76dbf1c558d`.
2. If the exact session's log viewer offers **Stop session**, the owner can
   choose it after confirming the session is safe to stop. GitHub documents
   that this ends the session's Actions run and preserves pushed commits.
   **Archive session** removes a stopped session from the list and does not
   establish that a contradictory API record is stopped.
   [GitHub's Stop session instructions](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/track-copilot-sessions#stop-a-session)
3. If the control is absent, or independent REST reads still disagree, contact
   [GitHub Support](https://support.github.com/contact). Include the repository,
   task and session IDs, the controller run, and the
   [sanitized API recheck](https://github.com/farbotkol/butterbox/actions/runs/45112245720).
   Ask GitHub to confirm and reconcile the child session's state. Share neither
   credentials nor prompts.
4. After GitHub resolves the record, recheck the task list and the task detail
   with the approved Copilot credential. Confirm the two task reads agree,
   the session snapshot is complete, and the affected session reports a
   stopped state. Let the next scheduled controller run apply the normal
   writer, lease, and PR gates. Keep #305, #306, and #290 open while recovery
   is pending.

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

### Correcting the recorded PR #302 deviation

[Run 45010717756](https://github.com/farbotkol/butterbox/actions/runs/45010717756)
confirmed the Copilot task and completed session, then stopped because merged
[PR #302](https://github.com/farbotkol/butterbox/pull/302) copied launch
instructions into the proof file. The original content criterion failed.

Keep both issues open, the synthetic lease and intent in place, and unattended
autonomy disabled while the corrective PR is reviewed. After it passes
`verify` and `database-smoke` and is squash-merged through the Development
protections, use a new owner-dispatched **reconcile** run on Development.
Supply the original **task_id**, **pr_number** of **302**, and the merged
**correction_pr_number**. Leave **confirmation** empty.

The run checks the original task, sessions, PR, proof deviation, squash merge
and required CI at merge time. It reports later original-head CI activity
separately. It also checks the corrective PR's CI, current Development
protections, ancestry, squash contents and exact approved proof on Development.
Issue #298 records both the original failure and the correction before lease
release. Issue #290 stays open.

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

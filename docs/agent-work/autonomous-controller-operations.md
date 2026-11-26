# Butterbox autonomous controller (Issue #290)

## Scope and safety

The existing hourly controller observes open PRs and an exclusive Git annotated-tag lease. The opt-in autonomous dispatcher runs only when `BUTTERBOX_AUTONOMY_ENABLED=true` (repository Actions variable) and the `COPILOT_AGENT_USER_TOKEN` Actions secret is present. It only runs against `copilot/Development`; it never runs for PRs.

Queue eligibility is strict: a GitHub Issue must be open, contain `## Acceptance criteria`, carry `autonomy-ready`, `dependencies-cleared`, and one priority from
`P0.00` through `P10.99` (case-insensitive, with `P0` through `P10`
accepted as aliases for the corresponding .00 values), and have no blocked/hold/external indicators. Epic, parent DEV-FACTORY, Xero #268/#270 dependent and existing-PR work is not eligible. The controller verifies that the owner applied each current queue label, checks GitHub's linked blockers for completed closure, and excludes assigned issues.

Before launching, the dispatcher fetches paginated GitHub Issues and open Development PRs plus Copilot task list. It refuses to start if any Development PR or active Copilot task exists. It rechecks live state, atomically acquires the same proven Git ref lease, checks again, then uses GitHub's documented `POST /agents/repos/{owner}/{repo}/tasks` endpoint with `base_ref=copilot/Development` and confirms the returned ID using `GET`. If the final preflight detects a state change before POST, the run releases its unused lease. If POST or GET is ambiguous, the lease is **retained** and no automatic retry is attempted.

**Credential and account eligibility.** GitHub documents the preview task creation endpoint for Copilot Business and Enterprise. General Copilot cloud agent access and the built-in-token Copilot CLI repair workflow have separate eligibility. A GitHub App user access token with repository **Agent tasks** read/write permission is the documented PAT-free option for task creation. The account owner must authorize the app, and the app must have access to this repository. GitHub also documents OAuth app user tokens. The Actions `GITHUB_TOKEN` and GitHub App installation tokens are unsupported for task creation.

Keep the repository variable off while verifying access. Use the approved user credential for a read-only `GET /agents/repos/farbotkol/butterbox/tasks` and confirm the account's Copilot seat and repository policy separately. A successful GET establishes read access only. Keep expiring app credentials and any refresh material in the approved secret store. The current workflow reads `COPILOT_AGENT_USER_TOKEN` and has no token refresh mechanism.

**Controlled unattended scope.** The dispatcher ranks the open, approved queue
by major priority, minor priority and issue number and repeats that evaluation
after reserving a lease. Task creation remains limited to historical proofs
#305 and #306. If a product issue ranks first, the evaluation reports that
product acceptance and owner review are pending before taking a lease.
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
A uniquely identified failed, cancelled or timed-out proof task can
be parked on the next evaluation when all its sessions have stopped, it
produced no artifacts, and no PR or competing writer can still be acting on
the lease. A PR with a different verifiable session branch does not delay
parking. The parking tag and issue comment are recorded before exact-lease
release. Artifacts that still require reconciliation keep the lease held.
The run summary flags no observed progress after 60 minutes and escalates
after two hours. The lease remains held while task or writer evidence is
unresolved. Automated re-entry is pending. Inspect the Actions
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

## Recover a lease retained before task dispatch

The controller never retries a task-creation POST. If the final preflight's
Copilot GET returns 403 after acquisition, the same run makes one fresh
recovery check. It can release the exact unused lease and exit. Another
evaluation runs the normal queue and approval checks before it can dispatch.
If the fresh check fails, the lease stays held and the job summary records
the point at which it stopped before POST. A missing task, an HTTP 200 token
probe, and the age of the lease cannot prove that a POST never reached GitHub.

For an evidenced primary quota reset, Copilot requests wait until the reset
deadline even if a timer wakes early. The existing per-wait and cumulative
limits still apply; an excessive wait or a backwards clock retains the lease.
This does not authorize replaying an ambiguous task-creation POST.

For an already merged and controller-reconciled acceptance proof, the owner
may use `lease_recovery=merged-verify` with the exact annotated lease tag SHA
after this change has passed review and required CI and been merged to
Development. Verification is read-only. It requires the exact stopped task,
proof PR and merge, required checks, issue closure and audit, unchanged lease,
current branch ancestry and the existing full writer and repair checks.
An unrelated open PR alone does not prevent this merged-proof verification.
If it reports `MERGED_RECOVERY_VERIFIED`, the owner may run
`lease_recovery=merged-release` with the same tag SHA; it repeats the checks and
uses compare-and-delete. A changed or missing tag, live or ambiguous writer,
incomplete inventory or failed evidence retains the lease. Neither mode
launches another task. This path remains limited to the historical acceptance
proofs. [Controller run #111](https://github.com/farbotkol/butterbox/actions/runs/45555719592)
confirmed release of the #306 lease at 4:47:28 pm Melbourne time on
25 November 2026.

For a retained lease, the repository owner can use the delivery controller's
manual `lease_recovery` input after the recovery code passes required checks
and lands on `copilot/Development`:

1. Review the exact acquisition run and attempt in GitHub Actions. Match the
   annotated tag's run ID, issue number, issue digest, tag SHA and commit
   target to the failed run and its checkout. The run must have a specific
   pre-dispatch stop in its logs. A run with `DISPATCH_UNCERTAIN` stays on the
   existing task reconciliation path. For an unknown outcome with no unique
   task, request GitHub Support confirmation and retain the lease.
2. Confirm that nobody is assigning a coding agent or allowing an existing
   session to resume while recovery is in progress. In **Butterbox
   action-based delivery controller (phase 1)**, select **Run workflow** on
   `copilot/Development`. Set **lease_recovery** to `verify` and
   **expected_lease_tag_sha** to the annotated tag SHA. This uses the stored
   Copilot credential for read-only task inventory and task detail requests.
3. Require `PRE_DISPATCH_RECOVERY_VERIFIED` in the run summary. The workflow
   checks the original attempt and checkout, live tag and issue, Development
   ancestry, open Development PRs and active CI repair. It checks the
   Copilot task list, every task's details and sessions, and re-reads the list
   for inventory changes. A matching lease marker, an active task or session,
   an inconsistent idle state, missing session prompts, incomplete snapshots,
   other writers, or an open Development PR blocks recovery. A task and all
   its sessions may be idle when their evidence is complete and no session
   matches the lease. The summary records blocking IDs and reasons without
   including prompt text.
4. To release, repeat the owner dispatch with `release` and the same tag SHA.
   It repeats the checks and uses a Git compare-and-delete against that SHA.
   Require `PRE_DISPATCH_LEASE_RELEASED` and independently confirm the active
   tag is absent. Both recovery modes bypass the normal controller jobs and
   skip dispatch, merge and issue mutation. If Git cannot confirm the result,
   inspect the live ref before any further action. Leave the lease held for
   failed or ambiguous checks, including unavailable attempt logs or task data.
5. Before a normal evaluation of #305, confirm the issue is open and
   unassigned, the owner approvals and blockers still pass, and the normal
   live writer, PR and CI-repair gates are clear. A subsequent normal
   evaluation uses the current Development SHA and acquires a fresh lease.

For [run 45121500090, attempt 1](https://github.com/farbotkol/butterbox/actions/runs/45121500090/attempts/1),
the reviewed historical stop is the GET 403 immediately after acquisition.
At its pinned checkout, that error could end the final preflight before the
only POST call. The recovery workflow recognizes this historical evidence
only for issue #305, run `actions_45121500090_1`, annotated tag
`7dd255f68cff1cf7a3774c980836ce8d010ac122` and base
`e8c7a42209e497e1c415a422e3343f9b43851fbb`. The later
[HTTP 200 token check](https://github.com/farbotkol/butterbox/actions/runs/45121783414)
discarded its body. Recovery still requires full current task and writer
evidence.


## Inventory pagination and product dispatch gate

Task inventory follows validated same-endpoint pagination links for up to
20 pages. Missing pagination or count evidence on a full page, changing
counts, malformed links, inconsistent task details and API budget exhaustion
stop mutations. The bounded historical writer audit is still needed because
task-state filters do not establish whether a terminal parent's older child
session can continue or resume. The controller currently uses that audit
before proof dispatch and before proof handoff mutations. The lease discovery
poll still checks the recent and active snapshots for a potential match.

Product dispatch requires an approved criterion-level acceptance workflow
that verifies scope, required exact-head checks and human acceptance.
General-purpose automation must also have reliable cross-PR work-area
conflict evidence and authoritative historical child-session coverage.
The current proof code does not support those decisions for product issues.

### Option 2 evidence and rollout gate

The Agent Tasks REST reference defines `since` as an inclusive filter on
parent task update time. Credentialed GET-only probes found an older-created
task via its newer parent `updated_at`, and a future cutoff returned no
tasks. One probe returned 61 unfiltered tasks, decomposed into 31 explicitly
non-archived and 30 explicitly archived tasks. Do not infer archive
coverage from the default query. Scoped discovery rejects returned rows
with missing, invalid or out-of-window modification times.

A completed parent with three completed sessions showed a parent update
timestamp just after the latest child update. Some other sampled tasks had
multiple completed sessions as well. This demonstrates completed-session
history. GitHub's API reference does not specify a parent state or timestamp
change when an older child becomes writable, or a visibility delay bound.
The previously observed failed parent with a queued child could no longer
be read by exact ID in the probe (HTTP 404).

A durable verification watermark becomes usable once coverage of historical
child changes is established for the existing credential. A complete
bootstrap must precede it. Persist the verified scan's start boundary after
all reads and consistency checks succeed, and query from that boundary
minus five minutes on the next run. Retain the previous boundary on any
failure, including an interrupted scan or quota exhaustion. Include active
states, the exact leased task and unresolved candidates, validate every page,
and reject conflicting observations. A watermark and overlap cannot recover
a change that GitHub never exposes. The current scoped result remains
discovery-only and the existing mutation checks stay in force.

The synthetic launch and reconcile paths use the existing writer filter and
exact task verification. The CI repair and generic Phase 2 merge workflows
use their existing lease and workflow gates. None of these paths is switched
to watermark-driven decisions without the same coverage proof.

In automated fixtures with 60, 100 and 1,000 historical tasks and two
relevant tasks, scoped discovery made four HTTP GETs each time. A simulated
older child that reactivated without changing its parent's listed state
or timestamp was invisible to that discovery and detected by the existing
audit. These counts apply to discovery, with no change to mutation quotas.

[REST reference](https://docs.github.com/en/rest/agent-tasks/agent-tasks#list-tasks-for-repository)
· [Filter probe](https://github.com/farbotkol/butterbox/actions/runs/45736462753)
· [Lifecycle sample](https://github.com/farbotkol/butterbox/actions/runs/45736527418)

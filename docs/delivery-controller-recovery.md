# Recover parked P0 work

Only pause scheduling for authorized maintenance. Record the reason, start
time and previous values. Check GitHub workflow 425440593 and the Supabase
Development job `butterbox-delivery-controller-fallback` after maintenance.
Check recent GitHub run events and Supabase run details separately. A successful
cron invocation or controller cycle does not by itself prove a delivery.

For #84, resolve the known acceptance and scope problems before asking the owner
to unpark. Fetch the current parking tag, stopped writer and preserved branch.
Historical tag values from PRs #336 and #337 are stale. #82 already holds an
active lease and must resume on PR #340.

The first Actions-identity integration probe reproduced HTTP 200 with a
plain-text `OK` response from GitHub Models inference. No model-generated
message was available to parse. Historic controller logs contain the same
parser error and omit the endpoint and parsing stage. The independent
acceptance gate requires valid assessment evidence.
[Actions probe](https://github.com/farbotkol/butterbox/actions/runs/45911590588/job/140221011597)

Use `unpark` only for authorized parked work, with the exact issue number
and current parking tag SHA. The controller records the immutable source
range, verifies the stopped writer and scoped diff, then removes the matching
parking tag. A normal scheduled cycle uses that range for recovery. Leave the
old PR and branch available as evidence.

GitHub documents cloud session steering and Agent Merge through interactive
surfaces. No supported programmatic repair-only continuation for this
repository was established. The existing programmatic Copilot CLI and Actions
credential were reused. The controller runs a separate tool-free assessment
session, runs repair in a disposable exact-head checkout while it holds the
lease, validates the changed scope, and compares the expected branch head
when publishing. The smoke run exercised the assessor and scoped repair of the
preserved #84 diagnostics without publishing to the product branch.
[Copilot CLI live smoke](https://github.com/farbotkol/butterbox/actions/runs/45912198033/job/140222971927)

A typed upstream failure leaves the PR and lease in place. Authenticated
#327 checkpoints record backoff and periodic health probes. Unhealthy cycles
return a failing job result. A native merge rejection uses a separate
checkpoint on the product issue tied to the lease, PR and head. It waits for
changed native evidence and never repeats an unchanged merge request. A
confirmed maintainer-approval gate requires a security decision and retains
the active PR. Other unchanged native restrictions are bounded by the
product recovery window.

## GitHub Actions approval on controller-authored PR updates

At PR #340 head `6f0506df55e5f82f88aa0a8e50a2b24420da5637`, four PR-triggered
runs from `github-actions[bot]` were approval-required and had no jobs.
Successful separate workflow dispatches provided independent acceptance
evidence. GitHub still rejected the protected merge. GitHub documents this
approval requirement for PRs created or updated with `GITHUB_TOKEN` and
supports an installation access token or personal access token for the
operation that creates or updates the PR.
[GitHub token event rules](https://docs.github.com/en/actions/concepts/security/github_token)
[PR-triggered Verify](https://github.com/farbotkol/butterbox/actions/runs/45948530590)

Use an existing approved GitHub App if one has suitable permissions.
The owner can check **Repository → Settings → Integrations → GitHub Apps**
and **Account → Settings → Developer settings → GitHub Apps → App →
Permissions & events**. The publisher currently uses `GITHUB_TOKEN`. The
supported target is an installation access token restricted to Butterbox
with **Contents: Read and write** for publishing to the verified work
branch. Keep check and merge permission with the existing controller
identities. Confirm an approved installation can publish and naturally
trigger PR CI before adopting it. Keep its signing credential confined to
trusted Development workflow code and keep it out of Copilot and PR jobs.
There is no documented repository switch for disabling this token event
approval. Do not loosen fork approval, branch rules or required checks.

For the already-generated runs on #340, an owner-authorized exception would
use **PR #340 → Conversation → Approve workflows to run** after verifying
the current head and workflow scope. Approval starts the GitHub workflows.
The controller still checks acceptance, merges under native rules, verifies
the exact deployment, closes the issue and releases the existing lease.

The live proof is one P0 delivery through confirmed Development deployment and
issue closure, followed by dispatch of the next eligible item. Keep #327 open
until that proof is recorded.

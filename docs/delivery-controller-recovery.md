# Recover parked P0 work

Issue #327 keeps the native controller schedule paused until the corrected
controller and recovery are verified. P1–P9 remain held. Both original pull
requests are closed unmerged, and their branches and parking tags are retained.

| Priority | Issue | Preserved pull request | Preserved head | Parking tag SHA |
| --- | --- | --- | --- | --- |
| P0.01 | #84 | #336 | `7bea6b8517e3f8e80bebcf5b73415b74e05cf9d1` | `1f2993e702be6f7d15b6bf264051c6a769e7eb22` |
| P0.02 | #82 | #337 | `1d71222d2450c54b4d1b60a74dc15651cf337c22` | `a32bc47554d740e9a1d98241ca18459a54b203f1` |

The current parking tags and both branch tips were verified on 27 November
2026. Reverify them and check for patch conflicts against the current
Development tip immediately before each unpark. Recover #84 first, then #82.
GitHub workflow 425440593 is disabled manually. Supabase Development
`butterbox-delivery-controller-fallback` is inactive.

The first Actions-identity integration probe reproduced HTTP 200 with a
plain-text `OK` response from GitHub Models inference. No model-generated
message was available to parse. Historic controller logs contain the same
parser error and omit the endpoint and parsing stage. The independent
acceptance gate requires valid assessment evidence.
[Actions probe](https://github.com/farbotkol/butterbox/actions/runs/45911590588/job/140221011597)

After the corrected controller merges, verify its required checks, live integration connectivity and recovery evidence.
For the authorized P0 recovery, enable the disabled workflow and use `unpark` with the issue number and exact parking tag SHA. The controller checks
the parked task and closed PR, verifies the stopped writer and scoped diff,
records the immutable source range, and compares and deletes the parking tag.
The next authorized controller cycle gives the new Copilot task the preserved
source range to apply under its own lease. The old PR and branch stay intact.
On the preserved #84 head the latest exact-head database and targeted browser
jobs reported four failing venue-settings checks, including duplicate accessible
alerts and a failed expected field value. An earlier head had React lint and
disposable Supabase startup failures. Run fresh required validation and
independent acceptance on each recovered head before merge.

GitHub documents cloud session steering and Agent Merge through interactive
surfaces. No supported programmatic repair-only continuation for this
repository was established. The existing programmatic Copilot CLI and Actions
credential were reused. The controller runs a separate tool-free assessment
session, runs repair in a disposable exact-head checkout while it holds the
lease, validates the changed scope, and compares the expected branch head
when publishing. The smoke run exercised the assessor and scoped repair of the
preserved #84 diagnostics without publishing to the product branch.
[Copilot CLI live smoke](https://github.com/farbotkol/butterbox/actions/runs/45912198033/job/140222971927)

A typed upstream response or model-output failure leaves the product PR and
lease in place. Authenticated #327 checkpoints record the retry state and
backoff. Once the circuit opens, a connectivity probe must pass before the
controller runs another cycle. Permanent request and permission failures
keep the circuit blocked for investigation.

The live proof is one P0 delivery through confirmed Development deployment and
issue closure, followed by dispatch of the next eligible item. Keep #327 open
until that proof is recorded.

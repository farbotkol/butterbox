# Issue #95 / PR #263 / attempt 01

## Status: blocked

The approved scope is an SMS-only partial slice. No SMS implementation was
added in this attempt. Email, push, WhatsApp and live messaging remain outside
the slice; issue #95 remains open.

Development was merged into the branch at `22b3376`. The coordination check
for that head passed. Existing in-app roster notifications were not changed.
The branch contains no changes to `docs/USER_GUIDE.md` or payroll files.

## Acceptance evidence

| Criterion | Status | Evidence |
|---|---|---|
| Consent/preferences respected | Blocked | `employee_preferences` has email flags, but no SMS consent or verified-phone model was identified. No SMS delivery path was added or tested. |
| Delivery queued with retry and logs | Blocked | No SMS outbox, provider adapter, retry or callback implementation was added or tested. |
| Failures do not block roster publication | Blocked | No SMS path was connected to publication. Failure isolation for SMS has not been implemented or tested. |
| Unsupported push devices have fallback | Blocked | Push is outside the authorized SMS slice. |

## Verification and next action

- The coordination check passed on `22b3376`:
  https://github.com/farbotkol/butterbox/actions/runs/43675238015.
- Verify stopped before application checks because this attempt's paired
  evidence files were missing:
  https://github.com/farbotkol/butterbox/actions/runs/43675239772.
- The earlier advisory browser run could not start its disposable database
  because port 59422 was occupied:
  https://github.com/farbotkol/butterbox/actions/runs/43675082794.
- No SMS, authorization, isolation or database tests were run. No messages
  were sent, and no credentials were accessed or printed.
- Documentation: not applicable to user guidance; no user-visible feature
  changed.

An implementer needs to establish and verify a trustworthy phone-ownership and
consent flow, durable asynchronous dispatch with safe retry and callback
handling, and the remaining requested tests before this slice can be reviewed.
The draft PR body still contains an automatic closing reference, which must be
removed while issue #95 remains incomplete. Live traffic also requires the
owner's explicit approval and token rotation.

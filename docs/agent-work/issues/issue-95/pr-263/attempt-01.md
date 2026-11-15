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

## Follow-up checkpoint — 2026-11-15

The earlier status above is historical. Commit `96ebc65` adds a disconnected
Twilio Messaging Service provider boundary and form-signature helper. It does
not implement a worker, callback route, database schema, consent capture,
verified phone ownership, tenant checks, quiet hours or sending. The current PR
body uses a reference rather than the earlier automatic closing reference.

The four original acceptance criteria remain blocked: the boundary alone does
not respect recorded consent, provide durable queueing, prove publication
failure isolation or implement push fallback. It must not be used for live
delivery.

- `node --experimental-strip-types --test tests/twilio-sms.test.mjs`: 4 passed;
  transport is mocked and no provider requests were made.
- `npx eslint src/lib/twilio-sms.ts tests/twilio-sms.test.mjs`: passed.
- `npx tsc --noEmit --incremental false`: passed.
- Secret scanning of the provider and tests: no secrets found.
- Provider documentation could not be fetched in this environment. Signature
  handling and callback URL normalization require verification against the
  current provider specification before a callback route is enabled.
- Documentation: `docs/sms-notifications.md` describes the disconnected
  boundary and its operational limitations. No user-visible feature changed;
  the shared User Guide was not edited.
- Database, tenant isolation, consent and browser tests were not run because
  those features are not implemented. Full issue and live-delivery acceptance
  remain outstanding; no deploy or outbound message was performed.

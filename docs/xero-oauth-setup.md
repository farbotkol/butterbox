# Xero OAuth connection setup

This is an owner/operator setup note for the first Xero connection slice. It
does not enable payroll submissions or establish AU Payroll API entitlement.
Do not use production payroll data for authorization checks.

## Server configuration

Set these variables only in the server-side Vercel project environment:

- `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` from the registered Xero app.
- `XERO_REDIRECT_URI`, exactly matching the app's registered URI and ending in
  `/api/xero/oauth/callback` (for example,
  `https://<approved-host>/api/xero/oauth/callback`).
- `XERO_TOKEN_ENCRYPTION_KEY`, a securely generated, base64-encoded 32-byte
  key. Generate it in a trusted environment, store it in the server secret
  manager, and never commit or paste its value into issues, logs, or fixtures.

The encryption key also protects OAuth state signatures. Keep it stable while
any Xero connection exists: changing it makes stored token ciphertext
undecryptable. Disconnect/revoke connections before a planned key replacement.
OAuth routes fail closed when any required setting is missing or malformed.

## Connect and disconnect

Only a current business owner or admin can start the OAuth flow, select an
organization, reconnect a revoked grant, or disconnect. The callback validates
the exact redirect URI, current Butterbox user and business role, and a
short-lived signed, HttpOnly, SameSite=Lax state cookie. OAuth codes and tokens
are exchanged and handled on the server only.

The app requests `offline_access payroll.timesheets`. Xero's AU Payroll v2
OpenAPI describes `POST /Timesheets` at
`https://api.xero.com/payroll.xro/2.0` with the `payroll.timesheets` scope; GET
operations also list `payroll.timesheets.read`. Xero's
[Payroll AU integration guide](https://developer.xero.com/documentation/api/payrollau/integration-guide)
requires a Standard or Advisor user role with Payroll Admin permissions to call
these endpoints. This connection slice does not call Payroll endpoints or
submit timesheets. Xero's `/connections` response only identifies organizations
available to the OAuth grant; it does not prove that Payroll AU is provisioned
or accessible.

Access and rotating refresh tokens are encrypted with AES-256-GCM before being
stored. The database keeps the grant associated with its Butterbox business,
and refresh uses a short database lease so concurrent requests cannot consume
the same rotating refresh token. A revoked/invalid refresh token is marked as
requiring reauthorization. Disconnect revokes the grant at Xero before removing
its final organization link; if provider revocation fails, the local connection
is retained and marked as requiring reauthorization. The owner may retry
disconnection or reauthorize. If several selected organizations share one
grant, disconnecting one removes only that organization link and leaves the
shared grant in place for the others.

## Verification limits and owner follow-up

CI uses synthetic tokens, fictional organization identifiers and mocked
provider responses. No OAuth credentials or live Xero account are used by the
test suite. The owner must complete a controlled Demo Company authorization
and confirm whether that specific Australian Demo Company exposes AU Payroll
API access. That check, actual authorization/refresh/revocation, and any payroll
submission remain unverified. Do not treat a successful OAuth connection as
payroll permission, a payroll test, production activation, or award/payroll
compliance.

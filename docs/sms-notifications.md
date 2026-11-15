# SMS notification delivery

SMS delivery is not available. In-app notifications continue to be the
notification channel. Do not configure or send live SMS from this branch.

The Twilio provider boundary is disconnected from the application: it has no
configured transport, worker, route, or access to environment variables.
The adapter can construct a roster notification for the Messaging Service and
classify its response, and the form-signature helper can check a callback
against an explicitly supplied HTTPS URL. Neither function establishes consent,
phone ownership, tenant eligibility, or permission to send. Callers must never
use a recipient-supplied callback URL.

Before any integration or activation, implement and test the tenant-scoped
outbox, durable idempotency, phone verification and explicit recipient
consent/opt-out, venue configuration, quiet hours, safe delivery claims and
callback state transitions. Treat timeouts and unknown outcomes as requiring
reconciliation, not automatic retry. Review Twilio's current signature and
retry specifications against provider documentation before connecting the
helper; this environment could not retrieve that documentation.

Real sending also requires token rotation, approved provider onboarding,
recipient consent and explicit owner approval. Do not store credentials or
real recipient details in repository files, issue comments, or logs. Email,
push and WhatsApp are not implemented by this slice.

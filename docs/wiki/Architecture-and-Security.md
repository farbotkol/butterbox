# Architecture, data and security

[← Wiki home](Home.md) · [Testing and release →](Testing-and-Release.md)

## Core stack

| Layer | Main technology or approach |
|---|---|
| Web UI | Next.js App Router (repository currently references Next.js 16), React 19, TypeScript, Tailwind CSS |
| Authentication | Supabase Auth, email confirmation, invitations and password-recovery flows |
| Backend/data | Supabase PostgreSQL; SQL migrations, functions/policies and server actions |
| Authorization | Business/venue/department membership checks **and** PostgreSQL Row Level Security |
| Tests | Node tests, ESLint/build, pgTAP/database tests, tenant isolation and Playwright/axe browser scenarios |
| Delivery | GitHub Actions workflows and protected PR-based merges; controlled nonproduction showcase |

These are the **Butterbox app** technologies. Do not confuse this stack with a separate enterprise platform.

## Scope and data boundary

```text
User / Supabase Auth session
          ↓
Authorized business membership
          ↓
Authorized venue and department
          ↓
Server-side validation + scoped queries + RLS
          ↓
Employees / shifts / clock events / approvals / export history
```

Tenant identity, role authorization, scope validation and stale-data protection must be enforced at service/database boundaries; a disabled button alone is insufficient. Avoid reusing session-scoped data after memberships are revoked or businesses switch.

## Data lifecycle and audit

Sensitive actions record attributable audit entries when the relevant migrations are installed. Access to the business audit history is owner-scoped. Core recorded facts such as original clock events and finalised payroll/export history have preservation controls; correction history should not masquerade as original time.

The owner has confirmed a **customer-owned records export and controlled-deletion direction**. Proposed post-cancellation timeframes in DEC-001 remain **unapproved defaults**; do not implement unconditional deletion or claim finalized retention periods.

## Isolation and demo safety

The isolated synthetic showcase has fictional staff, separate test credentials, disposable backend/storage and prominent **SIMULATION ONLY** indicators. It must not be populated with real customer records or used to process actual payroll. Public-preview sign-in availability does not make it a production service.

## Operational security

- Credentials and service-role keys must remain private and out of client-side public configuration.
- Destructive database tests run only in explicitly verified disposable environments.
- Production backup/recovery, retention, monitoring and incident-readiness gates require separate verification/approval.
- Email, third-party connectors and external notifications require configured services and explicit acceptance.

## Primary architecture references

[Engineering guardrails](../../AGENTS.md) · [README operations](../../README.md) · [Decision Log DEC-001 onward](../DECISION_LOG.md) · [Implementation evidence](../../IMPLEMENTATION_PROGRESS.md).

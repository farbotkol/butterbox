# Architecture, security, testing and operations

> Technical procedures and security claims must be checked against the [README](../../README.md) and [engineering instructions](../../AGENTS.md).

## Architecture

Butterbox is a Next.js/React/TypeScript application backed by Supabase PostgreSQL and Auth. Row-level security and server-side authorization protect business, venue, department and role boundaries. The delegated FOH/BOH management model must be preserved. See [AGENTS.md](../../AGENTS.md#product-and-architecture).

## Security and privacy

- Do not use real personnel, attendance, payroll or customer data in the synthetic showcase
- Keep privileged service credentials out of issues, PR evidence and the browser
- Treat business and role boundaries as server-side controls; test unauthorized and cross-tenant access
- Consult the [User Guide privacy section](../USER_GUIDE.md#data-privacy-and-cancellation) for user-facing behavior and caveats

## Development and verification

- [README: Local development](../../README.md#local-development)
- [README: Isolated local synthetic showcase](../../README.md#isolated-local-synthetic-showcase)
- [AGENTS: Risk-based testing](../../AGENTS.md#risk-based-change-focused-testing)
- [Implementation progress](../../IMPLEMENTATION_PROGRESS.md) for recorded acceptance evidence

Tests should match the change: documentation-only updates generally do not require executable tests, while authorization, tenant, SQL and payroll changes require relevant targeted verification. A green check does not substitute for verifying story acceptance criteria.

## Operations

- [README: Staging and production](../../README.md#staging-and-production)
- [README: Backup retention and recovery](../../README.md#backup-retention-and-recovery-runbook)
- [README: Operational error and health metrics](../../README.md#operational-error-and-health-metrics)

Any production deployment, destructive database test or third-party consent remains subject to its specific approval and safety gate.

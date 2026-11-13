# Accounts, personas and permissions

[← Wiki home](Home.md) · [Employee workflows →](Employee-Experience.md)

## Personas

| Persona | Documented responsibilities | Important boundary |
|---|---|---|
| **Business owner** | Business/venue configuration, access delegation, audit history, owner reports, approved-hours export and relevant finalisation | Owner-only features are not inherited by every manager or administrator |
| **Admin / general manager** | Supported staffing, venue and whole-venue review processes within the authorized business scope | Finalisation and departmental decisions require explicit scope and policy checks |
| **FOH / BOH / department manager** | Manage and review rosters, employees, offers, alerts and attendance for authorized departments | May not see or edit other departments or whole-business reports merely by manipulating a URL |
| **Employee** | Own published schedule, availability, offers/swaps, clocking, corrections, announcements and notification state | No management approvals, arbitrary employee records or payroll download |
| **Payroll preparer** | Authorized review of finalized approved time, employee mappings and export history | “Payroll administrator” describes a workflow, not an automatically granted universal role |

## Account lifecycle

1. A user creates an account, confirms their email and signs in.
2. A first-time owner enters business/venue details, address and timezone, and can save incomplete setup.
3. Authorized managers invite staff with appropriate membership scopes; invitations use the configured account-service email mechanism.
4. Users with multiple business memberships select a business in **Switch business**.
5. Password recovery, signed-out sessions and revoked access are enforced through Auth and authorization checks.

## Security model

Permissions are scoped to **business → venue → department → role/ownership** where applicable. The core implementation uses Supabase authentication, server-side authorization and PostgreSQL Row Level Security (RLS). Hidden buttons and absent navigation items are usability features, **not** the authorization boundary.

Use separate accounts or browser contexts to test negative access: a worker should not be able to approve another worker's time, a FOH manager should not view BOH-only data, and a user from another business must not access the first business's records.

## Practical caveats

- Some actions require a distinct reviewer rather than self-approval.
- Published shifts, locked time and finalized periods are subject to stricter change procedures than drafts.
- Switching businesses does not magically authorize a tab opened under a previous business.
- Membership changes or access revocation should be checked on the next operation, not inferred from stale UI.

**Source:** [User Guide: accounts and business access](../USER_GUIDE.md#accounts-and-business-access) · [AGENTS.md](../../AGENTS.md)

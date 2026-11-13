# Product overview and capabilities

[← Wiki home](Home.md) · [Venue operations →](Venue-Operations.md)

## The problem Butterbox addresses

Hospitality venues have related but often disconnected tasks: keeping employee records, managing availability, publishing rosters, capturing attendance, resolving exceptions, reviewing worked time and handing reliable approved hours to payroll. Butterbox aims to connect those tasks without claiming to replace a certified payroll engine.

## Core operating cycle

```text
Account + venue setup
        ↓
Departments, roles, employees and access
        ↓
Availability, leave and eligibility information
        ↓
Draft shifts → review (if configured) → publish
        ↓
Employee schedule, open-shift responses and shift swaps
        ↓
Clock in/out + breaks + exception/correction requests
        ↓
Timesheet review → approvals → payroll period finalisation
        ↓
Generic approved-hours CSV + traceable history/reconciliation
```

Each transition has explicit permissions, validation and failure handling. An attempted action is not the same as a confirmed result.

## Functional areas

| Area | What the documented application supports |
|---|---|
| Identity | Signup, email confirmation, sign-in, reset, invitations and membership switching |
| Venue management | Business and venue details, timezone/location, FOH/BOH departments and job roles |
| People | Employee directory/profiles, department links, eligible roles, preferences and availability |
| Rostering | Weekly people-by-day view, draft create/edit/delete/copy, conflict indicators, publication and optional approvals |
| Shift changes | Open shifts, offers/claims/confirmation, consent-based swaps and shift conversations |
| Attendance | Clock in/out, paid/unpaid breaks, point-in-time geolocation policy, correction flows and alert review |
| Timesheets | Worked-time derivation, source-event inspection, department approvals, exception handling and locked/finalised periods |
| Payroll preparation | Employee mapping metadata, finalised approved-hours CSV and recorded reconciliation |
| Reports | Owner hours/labour view, manager exceptions and supported owner CSV reports |
| Communication | In-app notifications and announcements; external delivery is not generally enabled |
| Administration | Sensitive-action audit history and operator-oriented operations tooling |

**Important:** “Supported” here means documented in the codebase/guide, not that every operation has been reaccepted for production. Consult [Status and roadmap](Status-and-Roadmap.md).

## Product boundaries

- Butterbox's generic payroll handoff does **not** calculate award rates, penalties, taxation, superannuation or wage compliance.
- External payroll connectors, including Xero, are separate roadmap work rather than an accepted live export path.
- An AI concept or preview card is not an active automation or reliable forecasting service.
- Not all development functionality has been deployed to the isolated public showcase.
- Multi-tenant access must be enforced independently of whichever screen or button is displayed.

## Further reading

[Full user tasks](../USER_GUIDE.md) · [Current implementation evidence](../../IMPLEMENTATION_PROGRESS.md) · [Owner decisions](../DECISION_LOG.md)

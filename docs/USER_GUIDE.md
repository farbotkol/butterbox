# Butterbox — User Guide

**Audience:** Australian café and restaurant owners, venue managers, employees and payroll administrators.  
**Status:** Living guide for functionality verified in the Main Roadmap branch; not a promise of production availability.  
**Product:** Butterbox Systems — *Less admin. More good days.*

> This guide is a functional overview, not a substitute for award interpretation, payroll/legal advice or a final production user acceptance walkthrough. Screen names and availability may change as the product evolves. Some features depend on role, venue and department permissions.

## Getting started — owners

1. Register and verify your account, then sign in.
2. Use the initial business setup to create your business and first venue. Supply the venue's name, address and timezone. If setup is interrupted, resume the saved setup.
3. Open the organisation/settings areas to set the venue's location/geofence, create or seed **Front of House (FOH)** and **Back of House (BOH)** departments, and configure job roles.
4. Invite employees and managers by email; use the appropriate business, venue and department scopes. Invited staff complete their own account registration.
5. Add employee profiles, associate eligible job roles and departments, and review employee availability before scheduling.
6. Create draft shifts in the weekly roster, check conflicts and publish when ready. A venue can use direct publication or an approval-based publication workflow.

**Permissions:** Owners can manage the business; general managers and FOH/BOH managers have scoped responsibilities. Employees can access their own supported self-service functionality. A manager must not assume that access to one department permits access to another. Accounts with multiple business memberships can switch the active business; each request is independently authorized.

## For owners and venue managers

### People and availability

- Maintain staff profiles, contact and employment status. Archived staff are excluded from new assignments by default; historical shifts remain represented.
- Assign job-role eligibility and an optional primary role. Restricted assignments are validated.
- Staff maintain regular availability and can submit date-specific exceptions and leave requests. Managers can review the relevant requests.
- Use the searchable team directory within your permitted business/venue/department scope.
- Employment rule metadata retains effective-dated employment basis and award/contract references. **This alone does not calculate or certify award-compliant pay.**

### Rostering

- The weekly people-by-day roster groups shifts by department and supports week navigation, venue filters and responsive layouts.
- Create, edit or copy draft shifts, including unassigned shifts. The roster checks overlaps, availability and other configured conflicts.
- Use drag-and-drop or keyboard alternatives for supported **draft** shift moves and duplication, with preview and guarded undo. Published shifts and review snapshots have separate integrity controls.
- Publish a roster explicitly; draft changes remain private until publication. Relevant staff receive in-app notices.
- If roster approval is enabled, a distinct authorized reviewer can approve or reject a submitted roster snapshot. Rejection requires a reason, and approval rechecks current blockers.

**Week-start setting:** The owner-approved direction is to allow a per-venue, Monday-default *planning/display week* without changing operational publication or payroll periods. This feature is not yet fully accepted; do not assume the existing editable roster has changed from its established week behavior.

### Open shifts and swaps

- Managers can offer available shifts; eligible staff may respond. A claim is committed transactionally to avoid double assignment.
- Staff can request shift swaps. Both participants must consent; a scoped manager reviews the request. Approval rechecks eligibility and conflicts, then updates the relevant published record/notification trail.
- An offer or swap is not final merely because a notification was received: check the actual recorded outcome.

### Attendance

- Employees can clock in and out and record breaks through supported workflows.
- Location verification is a configurable point-in-time check, not continuous tracking by default; exceptions and corrections have review processes.
- Where applicable, employees can view their own attendance history and correction decisions.
- The QR kiosk and automated late/no-show alerts are **not yet complete**.

### Timesheets and payroll preparation

1. Review computed worked-time records and employee-submitted corrections.
2. Approve work within your department/business permissions.
3. Finalize the payroll period under the approved workflow.
4. Generate a traceable payroll export or generic CSV where supported, and retain export identifiers/history.

**Important:** Butterbox's generic payroll records and CSV workflow do not mean Xero, MYOB, Employment Hero or QuickBooks integrations are live. Xero integration is intentionally deferred. Award Central's gross-pay interpretation is not yet independently approved for production calculations.

### Audit history

Business owners can review sensitive staffing, permission, roster, attendance and payroll changes in **Audit history**, with scoped filters and pagination. Audit records may contain personal information and should be shared only with appropriately authorized users.

## For employees

1. Accept your invitation, verify your account and sign in.
2. Open your own roster/schedule to see assigned shifts and publication updates.
3. Set weekly availability and enter date-specific unavailability or leave requests. Track status rather than assuming a request was approved.
4. Respond to open-shift offers or propose shift swaps if your business uses those workflows.
5. Clock in/out, record breaks, review personal attendance history and request corrections where needed.
6. Use the in-app notification centre for relevant outcomes and updates.

External email, push, SMS and WhatsApp notifications are **planned optional channels**, not currently guaranteed live delivery. Recipient preferences and consent govern any future activation.

## Troubleshooting

| Issue | First check |
| --- | --- |
| Cannot access a venue/department | Check active business membership and assigned permission scope; ask an owner for access. |
| Cannot receive an invitation | Confirm the address and whether the invitation expired, was revoked or already accepted. |
| Shift cannot be assigned | Check active employee status, eligible department/role, availability and conflicting shifts. |
| Roster not visible to staff | Confirm that the correct draft has been published or approved, and that the employee is assigned to the venue. |
| Clocking/location fails | Check device permission and the venue's location policy; use the supported exception/correction workflow. |
| Timesheet differs from expected | Review break facts, corrections and approval status; request a correction instead of editing finalized history. |
| No SMS/WhatsApp/email alert | These channels are not yet guaranteed operational. Check the in-app notification centre. |
| Payroll rates appear missing | The central award intelligence and external payroll adapters are not yet production-verified. |

## Data privacy and cancellation

Butterbox's agreed product direction is customer-owned export of employment records following cancellation, with a defined retrieval window and controlled deletion. **The proposed 60-day retrieval and day-90 deletion target are not yet final or activated.** Applicable legal retention and backup/recovery controls must be approved before destructive production deletion can be enabled. See [Decision Log](DECISION_LOG.md), especially DEC-001 through DEC-005.

## Features not yet generally available or accepted

- QR clocking kiosk and automated late/no-show alerts
- External notification channel delivery (email/push; SMS/WhatsApp additional planned options)
- Direct payroll provider adapters (including deferred Xero)
- Independent approved Award Central rule calculations
- Advanced AI rostering, forecasting and analytics
- SaaS subscription/self-service billing and full production release readiness

## Getting help and improving this guide

The application includes onboarding checklist and inline help for certain tasks, but comprehensive screen-by-screen contextual help is still planned. A future documentation story must verify each feature's actual routes, button labels, screenshots, permissions and failure cases using production-browser acceptance evidence before considering this guide a fully validated walkthrough.

**Document ownership:** Main Roadmap feature agent maintains user-facing guidance with each completed feature. Update this guide and any relevant help UI when workflows change; indicate unavailable or blocked capabilities explicitly.

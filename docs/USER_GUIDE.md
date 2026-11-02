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

**Week-start setting:** In organisation settings, an owner can set the
**Roster planning week** for each venue; the default is Monday. Changes take
effect after the current planning week, and a transition may be shorter than
seven days. Once a transition starts, wait until its scheduled date before
changing it again. **Open venue planning view** shows permitted shifts in a
read-only view. Editing, publication, timesheets and payroll retain their
existing Monday-based operational weeks. The broader organisation-settings
story remains incomplete because notification settings and delivery are not
yet accepted.

### Open shifts and swaps

- Managers can offer available shifts; eligible staff may respond. A claim is committed transactionally to avoid double assignment.
- Staff can request shift swaps. Both participants must consent; a scoped manager reviews the request. Approval rechecks eligibility and conflicts, then updates the relevant published record/notification trail.
- An offer or swap is not final merely because a notification was received: check the actual recorded outcome.

### Attendance

- Employees can clock in and out and record breaks through supported workflows.
- Location verification is a configurable point-in-time check, not continuous tracking by default; exceptions and corrections have review processes.
- Where applicable, employees can view their own attendance history and correction decisions.
- Managers can review late, missing-clock and no-show signals within their
  venue and department scope; an owner must first enable monitoring.

#### Configure and review attendance alerts

1. Open **Attendance**, select the venue and choose **Review attendance
   alerts**. Owners can set **Monitoring** to **On**, choose a **Grace period
   (minutes)** from 0 to 240, and a **No-show threshold (minutes)** greater
   than the grace period and no more than 1,440. Select **Save monitoring
   settings**. Monitoring is off by default for each venue.
2. Check the monitoring status and latest completed scan before relying on
   the list. An overdue or unavailable scan is explicitly warned about.
   Automated scans run every minute; a clock recorded after a scan starts
   may not appear until the next completed scan.
3. In **Alert review**, inspect the assigned published shift and underlying
   attendance. Draft, unassigned and non-scheduled shifts are excluded.
   The grace period applies after shift start and end. A **No-show signal**
   means no qualifying clock-in was recorded by the threshold, not proof
   that the employee was absent. Pending offline claims are not confirmed clocks.
4. Choose **Acknowledge alert** to record that the management team has seen
   it. To close it, enter a **Resolution reason** (up to 500 characters) and
   select **Resolve alert**. Expand **Review alert history** to see automatic
   changes and attributed decisions. Owners can also inspect these in
   **Audit history**.
5. Alerts appear in managers' **Notifications**. **Mark as read** and
   **View attendance alert** affect your own notification read state, not
   another manager's. Acknowledgement is shared with the team. Repeated scans
   do not duplicate the same signal; a changed signal reopens the alert and
   creates a new current unread notice.

FOH/BOH and other scoped managers can only review their permitted departments;
employees cannot use this review workspace. Only owners change monitoring
settings. Turning monitoring off stops new detection but retains history.
Alerts do not change original clock records, approve timesheets, calculate
pay or prove award breaches. External alert delivery is not enabled.

#### Set up a QR clock kiosk

1. As a business owner, open **Attendance**, select the venue and choose
   **Manage kiosk devices**. Enter a device name and select **Create activation
   code**. Only an owner can create, list or revoke these devices.
2. On the venue device, use a separate guest or managed browser without an
   owner's account signed in. Scan the setup QR, or open `/kiosk` and enter
   the one-time activation code. Keep the code private; it is shown once and
   expires after 15 minutes. Activation requires a secure connection.
3. Keep the venue kiosk page open. Its device access lasts up to 30 days; create
   and activate a new device when access expires. The display is independent
   of the owner's signed-in session.
4. Staff sign in on their own phones, scan the displayed QR and confirm their
   clock. Each code works once and expires within 45 seconds; the display
   refreshes after use or expiry.
5. In **Kiosk devices**, revoke a lost or shared device immediately. Removing a
   device from its browser alone does not revoke it; an owner should also use
   **Revoke** in kiosk settings. Revocation prevents unused codes from being
   used.

A QR can be photographed or relayed before expiry, so it is not proof of
physical presence. If the venue enables location verification, a clock with
unavailable or denied location may still be recorded and queued for review.
The usual attendance screen remains available when scanning is not possible.

### Timesheets and payroll preparation

1. Review computed worked-time records and employee-submitted corrections.
2. Approve work within your department/business permissions.
3. Finalize the payroll period under the approved workflow.
4. Generate a traceable payroll export or generic CSV where supported, and retain export identifiers/history.

**Important:** Butterbox's generic payroll records and CSV workflow do not mean Xero, MYOB, Employment Hero or QuickBooks integrations are live. Xero integration is intentionally deferred. Award Central's gross-pay interpretation is not yet independently approved for production calculations.

### Hours and labour — owners

1. Select **Hours and labour** in the main navigation. Only a business owner
   can view the page or request the report; manager, admin and employee access
   to timesheets does not confer access to this owner report.
2. Set **Week containing**, **Venue** and **Department**, then select **Apply
   filters**. Leave venue/department at **All venues**/**All departments** for
   business-wide totals. A selected department must belong to the selected
   venue; otherwise the page shows an error rather than different totals.
3. Read the summary and each venue/department card:
   - **Scheduled hours** are the full elapsed duration of assigned, scheduled,
     published shifts, without deducting planned breaks. Draft, cancelled and
     unassigned shifts are excluded.
   - **Approved worked hours** subtract all recorded breaks from effective
     clock duration and include only current approved, valid entries.
   - **Approved paid hours** add paid recorded breaks back to approved worked
     time; unpaid breaks remain excluded. Pending, returned, resubmitted,
     outdated and invalid entries are excluded and counted separately.
4. Choose **Review source timesheets** on a card to reconcile entries in the
   same venue and week. Department attribution follows the recorded session,
   not the employee's home department. Refresh the report after corrections,
   approvals or unlocks; outdated approval no longer contributes to totals.
5. Optionally enter an **Illustrative hourly rate (AUD)** from 0 to 10,000,
   with at most two decimal places. Costs multiply approved paid hours by
   that one uniform rate. Without it, the page says **Not estimated**.

The report uses Monday-based timesheet weeks in each venue's timezone, including
daylight-saving changes, independently of roster display settings. Shifts and
sessions starting inside the week are counted in full, even if they end outside
it. An empty week is explicitly identified. Duplicate or invalid filters and
unavailable/incomplete data show errors instead of a partial-success report.

**Estimates are not actual payroll.** Employee rates, awards, penalties,
overtime, minimum engagements, allowances, superannuation and tax are not
calculated. Each displayed estimate rounds once to cents, so rounded department
figures may differ from the rounded business total. The report is read-only;
it does not approve hours, export payroll or transmit data to a provider.

### Audit history

Business owners can review sensitive staffing, permission, roster, attendance and payroll changes in **Audit history**, with scoped filters and pagination. Audit records may contain personal information and should be shared only with appropriately authorized users.

## For employees

1. Accept your invitation, verify your account and sign in.
2. Open your own roster/schedule to see assigned shifts and publication updates.
3. Set weekly availability and enter date-specific unavailability or leave requests. Track status rather than assuming a request was approved.
4. Respond to open-shift offers or propose shift swaps if your business uses those workflows.
5. Clock in/out, record breaks, review personal attendance history and request corrections where needed. At a configured kiosk, sign in on your own phone first, scan the current code, check the venue and confirm the QR clock. If a code has expired or was used, wait for the display to refresh and scan again. End an open break in **Attendance** before using a QR to clock out.
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
| Kiosk code was used or expired | Sign in on your own phone, wait for a fresh kiosk code and scan again. If the device is unavailable or revoked, ask an owner to activate a new one or use the attendance screen. |
| Attendance alert is missing or out of date | Check venue monitoring, the latest scan, publication and assignment. Wait for the next scan after a clock; ask an operator about an overdue scan rather than assuming no exceptions exist. |
| Timesheet differs from expected | Review break facts, corrections and approval status; request a correction instead of editing finalized history. |
| Hours and labour total differs from the roster | Check publication, assignment, week/timezone and approval status. Scheduled hours include planned break time; worked/paid totals use approved recorded breaks. Use **Review source timesheets** to reconcile. |
| No SMS/WhatsApp/email alert | These channels are not yet guaranteed operational. Check the in-app notification centre. |
| Payroll rates appear missing | The central award intelligence and external payroll adapters are not yet production-verified. |

## Data privacy and cancellation

Butterbox's agreed product direction is customer-owned export of employment records following cancellation, with a defined retrieval window and controlled deletion. **The proposed 60-day retrieval and day-90 deletion target are not yet final or activated.** Applicable legal retention and backup/recovery controls must be approved before destructive production deletion can be enabled. See [Decision Log](DECISION_LOG.md), especially DEC-001 through DEC-005.

## Features not yet generally available or accepted

- External notification channel delivery (email/push; SMS/WhatsApp additional planned options)
- Direct payroll provider adapters (including deferred Xero)
- Independent approved Award Central rule calculations
- Advanced AI rostering, forecasting and analytics
- SaaS subscription/self-service billing and full production release readiness

## Getting help and improving this guide

The application includes onboarding checklist and inline help for certain tasks, but comprehensive screen-by-screen contextual help is still planned. A future documentation story must verify each feature's actual routes, button labels, screenshots, permissions and failure cases using production-browser acceptance evidence before considering this guide a fully validated walkthrough.

**Document ownership:** Main Roadmap feature agent maintains user-facing guidance with each completed feature. Update this guide and any relevant help UI when workflows change; indicate unavailable or blocked capabilities explicitly.

# Butterbox — User Guide

**Audience:** Australian café and restaurant owners, venue managers, employees and payroll administrators.  
**Status:** Living guide for functionality verified in the Main Roadmap branch; not a promise of production availability.  
**Product:** Butterbox Systems — *Less admin. More good days.*
**Guide version:** 1.1 — reviewed 2026-11-02 (Core Roadmap).

> This guide is a functional overview, not a substitute for award interpretation, payroll/legal advice or a final production user acceptance walkthrough. Screen names and availability may change as the product evolves. Some features depend on role, venue and department permissions.

**Find a task:** [Accounts and business access](#accounts-and-business-access) |
[People and availability](#people-and-availability) |
[Rostering](#rostering) | [Open shifts and swaps](#open-shifts-and-swaps) |
[Attendance](#attendance) | [Timesheets and payroll](#timesheets-and-payroll-preparation) |
[Hours and labour](#hours-and-labour--owners) |
[Internal showcase](#internal-synthetic-showcase) | [Troubleshooting](#troubleshooting)

## Internal synthetic showcase

This is a **local internal evaluation**, not a live customer workspace.
An authorized operator must prepare the separately verified showcase using the
[operator procedure](../README.md#isolated-local-synthetic-showcase). Do not
create a sample business through ordinary signup/setup or enter real names,
contact details, attendance or payroll information. The local review app is
`http://127.0.0.1:3137`; remote reviewer access has not been verified.

- Use only the scoped review account supplied privately by the operator.
  The private account inventory is not a public user guide or shared attachment.
  Existing password login works; public signup is disabled. There are
  14 fictional FOH/BOH staff, including department managers, plus the owner
  and a separate outside-business control owner.
- Confirm **SIMULATION ONLY** appears before reviewing. It identifies
  fictional data, not stronger permissions. Managers retain their assigned
  department scope; employees remain limited to their own supported workflows.
  Owners alone can access **Hours and labour** and the generic payroll CSV.
- The fixture includes current/prior venue-local roster weeks, availability,
  open shifts, recorded breaks, a correction and approved/finalised time.
  Ask the operator for the seeded dates rather than assuming a fixed week.
  Original clock events remain preserved alongside the correction.
- Any **Download payroll CSV** result has a `SIMULATION_ONLY-` filename and
  **SIMULATION ONLY - NOT FOR PAYROLL** on every row. It is an approved-hours
  sample, not a wage/award calculation, payslip or provider submission. Never
  import it into live payroll. The operator's private CSV snapshot has the
  same restriction.
- External notifications and live payroll are unavailable. Do not invite
  real workers or treat local captured mail as external delivery.
- Sign out when finished. Ask the operator to stop the app before a reset;
  reset discards review database edits and replaces the fictional fixture.
  It does not convert a demo into a real customer business.

This environment does not imply final branding approval, hosted reviewer
access, production readiness or legal/payroll compliance.

### Guided owner and payroll-preparation review

These are repeatable **read-only baseline walkthroughs** of the real app.
Sign out between roles or use separate browser profiles. The operator supplies
the owner/manager/employee credentials privately and the two seeded weeks from
the current fixture inventory: the roster week and the previous approved-time
week. Dates move when fixtures are reseeded; never assume a hard-coded date.
Leave forms unsubmitted unless deliberately running a separate synthetic
experiment, then have the operator reset before the next baseline review.

1. Sign in with the review **owner**. Confirm the simulation notice and
   **Get your first roster ready** checklist. Inspect the Business, Venue,
   Staff, Shift and Publish steps. Setup is already provisioned:
   `/setup` returns this existing account to its dashboard. This walkthrough
   does not register a new customer or demonstrate demo-to-paid conversion.
2. Use **Departments** in **Main navigation**. On **Departments and roles**,
   review FOH and BOH. Then open **People** and inspect the 14 **Employee
   profiles**, qualifications and department links. Do not send invitations.
   The fictional profiles have no verified award classification/pay rules.
3. Open **Rostering**. Use **Previous week**/**Next week**, or the seeded-week
   URL supplied by the operator, to open the roster week. With a single
   department selected, inspect **Publication history**. Choose **Department:
   All departments**, then **Apply filter** to see both departments and the
   two **Open shifts**. A single-department view shows only its one open shift.
   **Offer shift** is a real action, not an already-sent offer; do not submit
   it in this baseline. Unassigned shifts alone do not create employee offers.
4. Open **Timesheet review**. In **Week containing date**, enter the
   approved-time week and choose **Apply filters**. Inspect the **Payroll
   period**, which is already **Finalised**, and expand **Finalised payroll
   records (14)**. Review recorded breaks, approvals and source identifiers.
   These are existing approved fixtures, not a demonstration of newly approving
   a current week. Finalised time cannot change without an authorized reopen.
5. In **Generic payroll CSV**, expand **Payroll export history (1)** and
   choose **Download payroll CSV**. The baseline batch is already prepared;
   do not reopen the period or create a replacement. Confirm the
   `SIMULATION_ONLY-` filename and the notice on every row; never send it to
   live payroll. The [timesheet instructions](#timesheets-and-payroll-preparation)
   explain actual approval, preparation and reconciliation controls separately.
6. Open **Clock in / out** and review **Attendance correction history**.
   The owner-attributed fictional correction preserves its original event.
   The owner has no linked employee clock profile in this fixture; use the
   employee account for the self-service clock controls. Sign out.

### Guided FOH or BOH manager review

1. Sign in as the corresponding department manager. Open **People**: there
   are seven fictional staff in that department, not all 14.
2. Open **Rostering** at the supplied roster week. Review the department's
   one **Open shifts** vacancy. Do not submit **Offer shift** in the baseline.
3. Open **Timesheet review**, choose the approved-time week and **Apply
   filters**. Review the seven department groups and their **Approved**
   decisions. The manager's own time was decided by the owner, not self-approved.
   The period is already finalised, so **Approve time** is unavailable.
4. There is no **Download payroll CSV** or **Reopen payroll period** control
   for these department managers. Manually opening a sample download URL is
   also denied; guessing a URL never grants access. The owner-only **Hours
   and labour** report is likewise unavailable. Sign out before changing roles.

### Guided employee mobile review

1. At a narrow mobile viewport, sign in with the supplied employee account.
   Use the horizontally scrollable **Main navigation** to open **My schedule**.
   Open the supplied roster week and review **Next shift** and **Weekly
   schedule**. If the fixture is old, there may be no upcoming shift even
   though the selected historical week contains a published shift.
2. Open **Availability** and review **Recurring availability**. Do not save
   changes in the baseline. Open **Clock in / out**: **Clock in** is a real
   control, but leave it unsubmitted to keep the baseline unchanged.
3. Choose **View your attendance history**. **Your attendance history**
   contains this employee's four original clock/break events, not the team's
   records. The request-correction workflow does not silently rewrite history.
4. **Timesheet review** is not in this employee's navigation. Opening that
   page directly returns to the dashboard with a permission error; a sample
   payroll download is denied. Sign out when finished.

These journeys have targeted production-browser checks, including actual login,
navigation, mobile schedule accessibility and negative permissions. They do
not execute fresh customer onboarding, a new offer/clock/approval or a provider
submission. Those existing operational workflows have separate feature evidence;
hosted access, external notifications, live payroll, approved branding,
Award Central and production/legal acceptance are not implied.

## Getting started — owners

1. Register and verify your account, then sign in.
2. Use the initial business setup to create your business and first venue. Supply the venue's name, address and timezone. If setup is interrupted, resume the saved setup.
3. Open the organisation/settings areas to set the venue's location/geofence, create or seed **Front of House (FOH)** and **Back of House (BOH)** departments, and configure job roles.
4. Invite employees and managers by email; use the appropriate business, venue and department scopes. Invited staff complete their own account registration.
5. Add employee profiles, associate eligible job roles and departments, and review employee availability before scheduling.
6. Create draft shifts in the weekly roster, check conflicts and publish when ready. A venue can use direct publication or an approval-based publication workflow.

**Permissions:** Owners can manage the business; general managers and FOH/BOH managers have scoped responsibilities. Employees can access their own supported self-service functionality. A manager must not assume that access to one department permits access to another. Accounts with multiple business memberships can switch the active business; each request is independently authorized.

### Accounts and business access

- **Create account** opens registration (`/signup`); enter your email and a
  password of at least ten characters, then complete email verification.
  **Sign in** (`/login`) uses **Email address** and **Password**. Invalid
  credentials deliberately do not identify whether an account exists.
- Use **Forgot password?**, then **Send reset link** (`/forgot-password`).
  Follow the account-service email and choose **Update password** on
  `/reset-password`. An expired/invalid link requires a new reset request;
  after a completed reset, sign in with the new password.
- **Sign out** ends access, including session synchronization across tabs.
  If a session ends, sign in again before retrying an operation. Check the
  recorded outcome before resubmitting an uncertain clock, approval or export.
- With more than one membership, use **Switch business**, then **Open** on
  **Choose a business** (`/choose-business`). A page/form opened for another
  business stays attached to that business; switching does not authorize it
  for the new selection. If access was revoked, choose an available business
  rather than changing URL IDs.
- First-time owners use `/setup`: complete business/venue name, address and
  **Venue timezone**, then **Create workspace**. **Save progress** retains
  an incomplete setup. **Add a sample team** is unavailable in this environment;
  leave it off and create a clean workspace. This is not a demo-data installer.

Registration, password and staff-invitation emails are account-service messages
and depend on the deployment's configured mail service. They do not mean optional
roster/attendance email, SMS, push or WhatsApp channels are live.

### Delegate access and select a venue

1. As an owner, open **Permissions** (`/settings/permissions`). For an existing
   business member choose **Role**, **Venue** and **Department**, then **Save
   permissions**. Review the saved scope before giving that person work.
2. Owner membership administration is distinct from an employee profile,
   account link and role qualification. Department managers manage permitted
   departments; an extra employee qualification does not grant management rights.
3. Use each screen's **Venue** selector and its submit button to switch between
   already provisioned venues. Venue selection never changes business membership.
   The current app has no **Add venue** page/button: additional venue
   provisioning is a backend/operator workflow, not an instruction to create a
   second business or to modify a database yourself.
4. Owners configure location in **Departments** (`/settings/organisation`),
   under **Venue location and geofence**: set **Latitude**, **Longitude**
   and **Radius in metres**, then **Save venue location**. Choose **Clock
   location verification** and **Save clock location setting** separately.
   Coordinates must be valid; radius is a whole number from 1 to 10,000 metres.
   Clear all location fields together only after disabling verification.
5. In **Departments and roles**, authorized owner/admin/general-manager
   scopes can **Add department** or **Save department**. Eligible managers can
   **Add role**/**Save role** in their permitted department. Inactive departments
   must be reactivated before adding/reactivating roles. Role-level
   **Automatic assignment** and **Manual assignment** restrictions are separate;
   **Save restriction** is not a replacement for **Save manual restriction**.

If permissions or membership change while a form is open, reload and review
the current scope. Do not treat a hidden button as the security boundary.

## For owners and venue managers

### People and availability

- Maintain staff profiles, contact and employment status. Archived staff are excluded from new assignments by default; historical shifts remain represented.
- Assign job-role eligibility and an optional primary role. Restricted assignments are validated.
- Staff maintain regular availability and can submit date-specific exceptions and leave requests. Managers can review the relevant requests.
- Use the searchable team directory within your permitted business/venue/department scope.
- Employment rule metadata retains effective-dated employment basis and award/contract references. **This alone does not calculate or certify award-compliant pay.**

#### Maintain profiles, qualifications and invitations

1. Open **People** (`/people`, heading **Employee profiles**). Use **Search
   team**, **Venue**, **Department**, **Role** and **Status**, then **Filter
   team**. **Archived** records are historical, not deleted.
2. Under **Add employee**, supply the profile and primary department, then
   **Add employee**. On an existing profile choose **Save employee**.
   Set **Status** to **Archived** rather than deleting historical records;
   select an active status and save to reactivate. Managers of additional
   departments may see the profile without being able to edit its home details.
3. Use **Save departments** for additional eligible departments, **Save
   eligible roles** for qualifications and **Set primary role** for the
   **Primary qualified role**. Choose a replacement primary role before removing
   its qualification/department. Changing the profile job title manually can
   clear a different primary qualified role. Inactive roles are unavailable for
   new work; qualification alone does not override availability/conflicts.
4. Under **Staff invitation**, enter **Invitation email** and **Send
   invitation** for an active, unlinked employee in an active department.
   The recipient verifies the email and chooses their own password; an existing
   Butterbox account joins this business with employee access, not inherited
   permissions from another business. Invitations expire after seven days.
   Use **Resend email** or **Revoke invitation** as appropriate; issue a new
   invitation after expiry. Only the intended authenticated recipient may accept.
5. **Save account link** links an existing eligible business member to the
   profile for self-service. This is distinct from an invitation. Authorized
   cross-venue managers may **Link profiles**/**Unlink profile** under **Shared
   staff across venues** after checking the identity confirmations. Linking
   affects cross-venue conflict/attendance identity checks, not permission scope.
6. Choose **Review employment metadata** on a profile. Supply **Effective date**,
   **Employment basis** and optional classification/award/contract references.
   Review dated history before saving a new record: future dates do not apply
   yet, and a later same-date record supersedes rather than deletes the earlier
   entry. If the record changed concurrently, refresh before saving again.
   Unknown metadata is not evidence that no employment obligations apply.

#### Maintain availability, leave and preferences

1. Open **Availability** (`/availability`, heading **Availability and leave**).
   On your linked employee profile add recurring day/time intervals and **Save
   availability**. An overnight interval belongs to the selected starting day.
   Review the explicit unavailable-week choice before saving an empty pattern.
2. Under **Date exceptions**, choose **Block dates (unavailable)** or **Request
   leave**, set **From**/**Through** and **Save date exception**. Date blocks
   and approved leave override recurring availability for whole local days;
   pending leave is visible but does not yet change availability.
3. Use **Cancel** for an active date block or pending request. Approved leave
   needs a manager: in **Team leave requests**, scoped managers can **Approve**,
   **Reject** or **Confirm cancellation**. Read the resulting status rather
   than assuming a request or cancellation was approved.
4. Under **Work preferences**, set **Preferred weekly hours (optional)** from
   0 to 168 in quarter-hour increments, select both email choices and **Save
   work preferences**. Hours are preferences, not contract limits. The saved
   email choices do not activate external notification delivery.

### Rostering

- The weekly people-by-day roster groups shifts by department and supports week navigation, venue filters and responsive layouts.
- Create, edit or copy draft shifts, including unassigned shifts. The roster checks overlaps, availability and other configured conflicts.
- Use drag-and-drop or keyboard alternatives for supported **draft** shift moves and duplication, with preview and guarded undo. Published shifts and review snapshots have separate integrity controls.
- Publish a roster explicitly; draft changes remain private until publication. Relevant staff receive in-app notices.
- If roster approval is enabled, a distinct authorized reviewer can approve or reject a submitted roster snapshot. Rejection requires a reason, and approval rechecks current blockers.

#### Build, copy and publish a week

1. Open **Rostering** (`/roster`), select the venue, operational week and
   department. Use **Collapse**/**Expand** for department rows; filters do not
   grant access to other departments.
2. In **Add a shift**, choose role, team member (or leave unassigned), **Starts**,
   **Ends** and **Break (mins)**, then **Save draft shift**. To edit an existing
   draft use **Update draft shift**. A draft is not employee-visible; a planned
   break is not a recorded paid/unpaid break.
3. **Copy a previous week** and **Copy into this week** create private editable
   drafts in the selected department. Review each new shift for current
   eligibility and conflicts before publication. This is week copying, not a
   separate named-template library.
4. For a quick change, activate the shift's **Move or duplicate** control with
   keyboard/touch, or drag to a team member/day. Choose the action/destination
   and **Preview change**. Inspect blockers/warnings, then **Apply move** or
   **Create draft duplicate**. Published shifts can be duplicated as drafts,
   not moved. **Undo last quick change** rechecks that undo is still safe.
   If the result is uncertain, use **Retry same request** or reload and inspect;
   do not repeatedly create new requests.
5. Resolve overlap, eligibility and blocking availability issues. Owners can
   configure **Roster conflict rules** in **Departments** and **Save roster
   conflict rules**; warnings and blockers differ by policy. Warnings are not
   payroll/legal clearance. Assignment and publication recheck current data.
6. For direct publication choose **Publish this department**. In approval mode,
   **Submit for review** creates an immutable submitted snapshot. In **Roster
   reviews**, a different authorized reviewer uses **Approve and publish** or
   enters a rejection reason and rejects it; the requester can **Withdraw
   review**. Changed/stale drafts require withdrawal/rejection and resubmission.
   Later-added drafts are not silently included in an earlier approval.
7. Check **Publication history** and in-app notices. Employees use **My
   schedule** (`/my-schedule`) for assigned published shifts; where required,
   use **Acknowledge shift**. Reading a notice is not shift acknowledgement.
   A changed published assignment can require a fresh acknowledgement.

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

**Open-shift sequence:** In the roster's **Open shifts**, publish an upcoming
unassigned shift before offering it. Choose eligible staff and a future **Offer
expires** time before shift start. Employees see **Claim shift** or decline in
**My schedule**. A claim expresses interest: the manager must confirm a claimant
before the shift is assigned. Competing confirmations cannot both fill it;
if a candidate is no longer available, refresh and reassess rather than
assuming assignment. Managers may withdraw an open offer.

**Swap sequence:** Follow the shift-swaps link to `/shift-swaps`. The requester
chooses a colleague and **Request swap**. The recipient chooses **Choose your
shift to exchange**, then **Propose and confirm my shift**; the requester must
then **Confirm exchange**. Either can decline at the relevant step. A scoped
manager uses **Approve swap** or supplies **Reason for rejection** and **Reject
swap**. Both consent and current eligibility/conflicts are required. If a
shift changes, create a new request; a stale snapshot cannot be approved.
Both employees receive in-app outcomes; verify the resulting published shifts.

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

#### Clock, review location and correct reported time

1. Open **Clock in / out** (`/attendance`), choose the right permitted
   employee/department if prompted and **Clock in**. Check **Current attendance**.
   Use **Start paid break** or **Start unpaid break**, **End break**, then
   **Clock out**. End an open break before clocking out. The page shows the
   server-recorded result, not a successful clock just because a button was pressed.
2. If location verification is enabled, permit the point-in-time location check.
   Denied, inaccurate or unavailable location can still record a clock with an
   exception. Managers inspect **Location exceptions**, then **Mark as reviewed**
   with the required review details. That review does not alter original time.
3. Employees use **Submit correction request** for a missing/incorrect clock:
   choose the event, proposed local time and reason. If a daylight-saving time
   occurs twice, choose the correct occurrence; a nonexistent local time is
   rejected. Submission does not itself change recorded attendance.
4. Managers review these requests in **Attendance**. Compare the recorded event
   and reported time, enter **Reason for review**, then **Approve if time already
   matches**, **Approve and apply proposed time**, or **Reject request**.
   Creating a missing session or completing an open session requires explicit
   unverified-time confirmation and checking breaks; it is not automatic approval.
5. For a finished session, open **Work time** (`/work-time`), expand **Review
   and correct attendance**, choose the event/time, enter **Reason for correction**
   and **Save correction**. Original events remain immutable; corrections and
   edit-lock decisions are attributed additions visible in history.
6. **Lock attendance edits** prevents corrections but is not approval.
   Scoped owners/admins/general managers may **Unlock attendance edits** with
   a reason. An unlock/change can invalidate prior approval. Finalised payroll
   must be reopened before attendance can change; refresh after a stale-data error.

#### Use the offline fallback safely

- While signed in and online, expand **Prepare this tab for offline reopening**,
  choose matching **Offline passphrase** values of 12 to 128 characters and
  **Prepare offline reopening**. Preparation is scoped to this tab, account
  and venue; signing out removes it. Another tab is not automatically prepared.
- If clocking fails, use **Save offline clock in**/**Save offline clock out**
  in **Offline attendance fallback**. These are unverified device-time claims,
  not confirmed server clocks, approved hours or captured breaks.
- Reconnect and use the same account to upload pending claims. Retain the device
  data until receipt is confirmed; clearing browser data can lose pending claims.
  A changed/unknown account session disables the fallback until checked online.
  If storage or JavaScript fails, note the time separately and contact a manager.
- Managers reconcile a claim with a finished event using **Match without
  changing time** or **Use claimed time as correction**, with a reason.
  Paired claims or a missing clock-out can create/complete attendance only
  through the explicit review forms; review reported breaks before approval.
  Rejected/previously linked claims must not be used to duplicate attendance.

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

#### Review, approve and finalise time

1. Open **Timesheet review** (`/timesheets`, heading **Weekly timesheet review**).
   Choose **Venue**, **Week containing date** and **Employee**, then **Apply
   filters**. Weeks are Monday-based in the venue timezone; corrected session
   start determines the week. Overnight records are not split.
2. Compare **Published shifts** with **Attendance sessions** and **Inspect source
   events**. Elapsed time is clock span; worked time subtracts all recorded
   breaks; paid time subtracts only unpaid breaks. Missing/invalid clocks or
   breaks show unavailable calculations, not zero hours. Scheduled span includes
   planned break time; matching totals do not pair sessions with shifts.
3. Department managers use **Approve time** or enter **Reason for returning**
   and **Return for correction**. Only an owner may decide their own attendance;
   other managers need another authorized reviewer. Approval locks edits.
   Pending/returned/outdated entries are not approved merely because they are locked.
4. For bulk edit locks, select valid unlocked sessions, provide the reason and
   review the receipt's locked/excluded/already-locked counts. Bulk locking is
   not department approval or payroll finalisation.
5. In **Payroll period**, resolve **Outstanding exceptions**. An owner, admin
   or general manager with access to every venue department can **Finalise
   payroll period**, only after the week ends. The action covers the whole
   venue, not the current employee filter. A finalisation snapshot retains exact
   seconds even when displayed durations are rounded.
6. An authorized whole-venue reviewer can enter **Reason for reopening** and
   **Reopen payroll period** before changes. Reapprove changed entries and
   finalise again; reopening does not erase the previous snapshot or exported
   history. If period state cannot load, attendance changes fail closed.

#### Prepare CSV, reconcile exports and map employees

1. In a finalised, exception-free venue week, review **Generic payroll CSV**,
   then **Prepare payroll CSV** and the recorded batch/history. A batch contains
   only approved sessions never exported before and is **whole venue** even if
   an employee filter is selected. Its canonical records preserve source
   attendance, approval and finalisation references; this is not wage calculation.
2. Preparation, download and provider import are different events. Check the
   saved batch and **Payroll export history** before retrying; downloading or
   importing the same batch again may pay people twice. Retain batch/finalisation
   IDs and confirm any import separately in your payroll system.
3. After an exported session changes, inspect before/after records, make any
   required adjustment outside Butterbox, enter **Reconciliation reason**,
   confirm the external handling and **Record manual reconciliation**.
   Previously exported sessions are not emitted again. This records your
   acknowledgement; Butterbox does not send an adjustment.
4. Owners/admins use **Manage payroll employee mapping** in the payroll-period
   section to open `/settings/payroll`. Use **Add mapping destination**, select
   the destination and **Show mappings**. Enter each **Payroll employee ID** and
   **Reason for mapping change**, then **Save payroll ID**. A blank ID removes
   the mapping and blocks provider-ready records for that employee. Refresh
   after duplicate/stale/conflicting-ID errors; never guess an employee ID.
5. Mapping setup is not OAuth or a connected provider. The generic CSV contains
   no external payroll IDs; saving a destination does not alter that fact.

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

Open `/settings/audit` through **Audit history**; filter by **Change category**,
**Operation**, **Actor user ID**, **From date (UTC)** and **Through date (UTC)**.
Use **Previous audit page**/**Next audit page** when available. UTC audit-date
filters differ from venue-local timesheet weeks. A failed/incomplete load is
not proof that no activity occurred.

## For employees

1. Accept your invitation, verify your account and sign in.
2. Open your own roster/schedule to see assigned shifts and publication updates.
3. Set weekly availability and enter date-specific unavailability or leave requests. Track status rather than assuming a request was approved.
4. Respond to open-shift offers or propose shift swaps if your business uses those workflows.
5. Clock in/out, record breaks, review personal attendance history and request corrections where needed. At a configured kiosk, sign in on your own phone first, scan the current code, check the venue and confirm the QR clock. If a code has expired or was used, wait for the display to refresh and scan again. End an open break in **Attendance** before using a QR to clock out.
6. Use the in-app notification centre for relevant outcomes and updates.

**Notifications** (`/notifications`) contains your permitted roster updates,
open-shift offers/outcomes and swap events; scoped managers also see attendance
alerts. Opening/marking a notice read does not acknowledge a shift, consent to a
swap, confirm an open-shift claim or approve time. Use the linked task screen for
those decisions. Use **View your attendance history** from **Attendance** for
your own historical effective clocks and correction decisions.

**Mobile and keyboard use:** Horizontal main navigation can scroll on a narrow
screen. Use **Skip to main content** and visible keyboard focus; quick roster
changes have explicit controls instead of requiring a drag gesture. Wait for
loading/pending state and the actual result. If a result is uncertain, refresh
and inspect history before retrying. No fixed response-time guarantee is implied.

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

Open **Help** in **Main navigation** for the authenticated **Help Center**
(`/help`). It renders selected sections of this maintained Markdown guide
as HTML; it is not a separate hand-maintained copy.

1. Use **Search help** for keywords, optionally choose a **Category**, then
   **Search**. All entered terms must match a task's title, category or content.
   An empty search lists available tasks; no matches are reported explicitly.
   Searches are limited to 160 characters.
2. Open a task, use its internal links, or choose **All help topics**.
   Search and links retain the selected business. Mobile navigation may scroll;
   native form controls and visible keyboard focus remain available.
3. Available tasks follow the current server-verified membership. Employees
   do not receive owner administration/payroll-preparation articles;
   department managers do not receive owner-only audit/report tasks. Describing
   a scoped workflow does not grant permission to execute it. A forged role,
   topic or business URL does not expand access; unknown/forbidden topics
   return a not-found page. If business access cannot be verified, help shows
   an explicit unavailable state instead of another business's content.
4. Before initial setup, an authenticated new owner can open `/help` for
   onboarding/common guidance and use **Back to setup**. Signed-out requests
   return to sign-in. Showcase walkthrough topics appear only in the explicitly
   configured synthetic environment, not normal customer workspaces.

Raw embedded HTML, images and unapproved URLs are not rendered by the help
viewer. Guide references without a permitted in-app destination remain text.
Unavailable capabilities and payroll/legal limitations remain clearly marked.

### Help at the point of work

Use the following contextual links without submitting a workflow form:

| Screen | Link | Guidance |
| --- | --- | --- |
| Set up your workspace | Help with workspace setup | Getting started |
| Owner's first-roster checklist | Help with your first roster | Getting started |
| Weekly roster | Help with rosters | Building/publishing for managers; employee self-service for employees |
| My schedule | Help with your schedule | Employee self-service |
| Clock in / out | Help with clocking and corrections | Clocking, recorded breaks, location and correction requests |
| Weekly timesheet review | Help with timesheet review | Scoped review, approval and finalisation limitations |
| Generic payroll CSV section | Help with payroll CSV | Preparing/reconciling approved-hours CSV; only shown with the existing finalisation/export permission |
| Payroll employee mapping | Help with payroll preparation | Mapping limitations and payroll-preparation guidance |

Links retain the server-resolved business; help does not broaden venue,
department or payroll access. Employees cannot use a direct timesheet URL to
obtain manager guidance. **All help topics** returns to browsing; use browser
Back to return to the originating screen. Search does not change application
records. The desktop **Contact support** link opens an email composer; it is
not the in-app Help Center or a guarantee of support delivery.

### Guide review and maintenance

Documentation is part of the user-visible feature Definition of Done in
[AGENTS.md](../AGENTS.md). Review changed labels, routes, scope, errors and
limitations with each affected feature; add an entry below and update the
coverage index. Keep this Markdown canonical rather than editing generated HTML.
Run `node --experimental-strip-types --test tests/help.test.mjs` for source,
content/link, documented-label and history checks. Rerun focused production
browser scenarios when affected screens, navigation or help rendering change;
those checks include actual article destinations, keyboard focus and mobile
axe/overflow. Automated label contracts cover the core contextual workflows,
not every sentence or all app screens; human review remains necessary.

| Version | Reviewed (UTC date) | Source checkpoint / change | Verified scope |
| --- | --- | --- | --- |
| 1.0 | 2026-11-02 | `c1ddaf3` (guide audit); DEMO-001/002 evidence below | Done-feature mapping and source label/permission review; recorded targeted browser evidence, not a fresh full-app walkthrough |
| 1.1 | 2026-11-02 | `9918957` (DOC-002); DOC-003 contextual links | Markdown-backed role-safe search and core contextual navigation; targeted runtime and lightweight upkeep checks |

No actual UI screenshots or optional AI help are available through this viewer.
Do not present concept artwork as UI evidence or planned AI assistance as a
working support feature.

### Verification scope and feature coverage

This guide was checked on 2026-11-02 against the Main Roadmap implementation
through `c1ddaf3`, with BB-DEMO-001/002 guidance added after targeted checks.
Routes, button wording, role checks and recovery paths were
source-reviewed. The kiosk, attendance-alert, reporting and isolated-showcase workflows also have
recorded targeted production-browser evidence in
[implementation progress](../IMPLEMENTATION_PROGRESS.md). This documentation
audit is **not** a new browser replay of every screen or a production sign-off.
No screenshots or generated UI images are included; illustrative brand
concepts are not screen evidence.

Source checkpoints for maintainers:

| Area | Inspected implementation |
| --- | --- |
| Account and session | [Login](../src/app/login/page.tsx), [registration](../src/app/signup/page.tsx), [reset request](../src/app/forgot-password/page.tsx), [reset completion](../src/app/reset-password/page.tsx), [setup](../src/app/setup/page.tsx) |
| Business and access | [Chooser](../src/app/choose-business/page.tsx), [workspace context](../src/lib/workspace.ts), [permissions](../src/app/settings/permissions/page.tsx), [navigation](../src/components/main-navigation.tsx) |
| Organisation and people | [Departments](../src/app/settings/organisation/page.tsx), [people](../src/app/people/page.tsx), [employment](../src/app/people/[employeeId]/employment/page.tsx), [availability](../src/app/availability/page.tsx) |
| Roster and exchanges | [Roster](../src/app/roster/page.tsx), [editor](../src/components/shift-editor.tsx), [quick changes](../src/components/roster-quick-changes.tsx), [copy](../src/components/copy-roster-form.tsx), [review](../src/components/roster-review-panel.tsx), [schedule](../src/app/my-schedule/page.tsx), [swaps](../src/app/shift-swaps/page.tsx) |
| Attendance | [Clock/review](../src/app/attendance/page.tsx), [offline fallback](../src/components/offline-attendance.tsx), [offline review](../src/components/offline-claim-review.tsx), [work time](../src/app/work-time/page.tsx), [alerts](../src/app/attendance/alerts/page.tsx), [kiosk](../src/app/attendance/kiosks/page.tsx) |
| Payroll, notices and reporting | [Timesheets](../src/app/timesheets/page.tsx), [mapping](../src/app/settings/payroll/page.tsx), [notifications](../src/app/notifications/page.tsx), [audit](../src/app/settings/audit/page.tsx), [hours](../src/app/reports/hours/page.tsx) |
| Internal showcase | [Environment](../scripts/showcase-environment.mjs), [fixtures/reset](../scripts/showcase-fixtures.mjs), [simulation configuration](../src/lib/showcase.ts), [production browser check](../tests/e2e/showcase.spec.mjs) |

Every Done story at this audit checkpoint maps to task guidance below, or to an
explicit non-user-facing reason. Update this index when a story becomes Done.

| Story | Guidance / non-user-facing reason |
| --- | --- |
| BB-DEMO-001 | Internal synthetic showcase — local review accounts, fictional records, sample-only CSV and reset limitations |
| BB-DEMO-002 | Guided owner/payroll, scoped FOH/BOH manager and mobile employee baseline reviews; real navigation, permission failures and explicit omissions |
| BB-DOC-002 | Getting help and improving this guide — authenticated role-scoped HTML, search, task navigation, denied/empty states and limitations |
| BB-DOC-003 | Help at the point of work; Guide review and maintenance — scoped core links, review history, lightweight checks and accurate screenshot/AI limitations |
| BB-FOUND-002 | Accounts and business access — registration, sign-in/out and reset |
| BB-FOUND-003 | Accounts and business access; Delegate access — tenant selection never grants access |
| BB-FOUND-004 | Delegate access and select a venue — owner membership administration and scoped managers |
| BB-FOUND-005 | Maintain profiles, qualifications and invitations — invite/accept/resend/revoke |
| BB-FOUND-006 | Accounts and business access — Switch business and existing-tab behavior |
| BB-FOUND-007 | Audit history — owner filters and UTC dates |
| BB-ORG-001 | Accounts and business access — Create workspace / Save progress; sample safeguard |
| BB-ORG-002 | Delegate access and select a venue — geofence and clock-location policy |
| BB-ORG-003 | Delegate access and select a venue — departments, roles and restrictions |
| BB-ORG-004 | Delegate access and select a venue — department management scope |
| BB-ORG-005 | Delegate access and select a venue — existing-venue selectors; additional provisioning is backend-only |
| BB-PEOPLE-001 | Maintain profiles, qualifications and invitations — add/save/archive/reactivate |
| BB-PEOPLE-002 | Maintain profiles, qualifications and invitations — departments, eligible and primary roles |
| BB-PEOPLE-003 | Maintain availability, leave and preferences — recurring intervals |
| BB-PEOPLE-004 | Maintain availability, leave and preferences — date exceptions and leave decisions |
| BB-PEOPLE-005 | Maintain availability, leave and preferences — preferred hours/email choices; profile contact email |
| BB-PEOPLE-006 | Maintain profiles, qualifications and invitations — directory filters |
| BB-ROSTER-001 | Build, copy and publish a week — weekly roster |
| BB-ROSTER-002 | Build, copy and publish a week — draft create/edit |
| BB-ROSTER-003 | Build, copy and publish a week; Open shifts and swaps — unassigned coverage |
| BB-ROSTER-004 | Build, copy and publish a week — actual week-copy workflow, not a named-template library |
| BB-ROSTER-005 | Build, copy and publish a week — preview/apply/guarded undo and keyboard alternative |
| BB-ROSTER-006 | Build, copy and publish a week — filters and collapse |
| BB-ROSTER-007 | Build, copy and publish a week — conflict warnings/blockers |
| BB-ROSTER-008 | Build, copy and publish a week; Notifications — publish/notices/acknowledgement |
| BB-ROSTER-009 | Build, copy and publish a week — distinct snapshot reviewer |
| BB-ROSTER-010 | Build, copy and publish a week; For employees — My schedule |
| BB-ATTEND-001 | Clock, review location and correct reported time — server clocks |
| BB-ATTEND-002 | Clock, review location and correct reported time — paid/unpaid breaks |
| BB-ATTEND-003 | Delegate access; Clock, review location and correct reported time — location policy/exceptions |
| BB-ATTEND-004 | Set up a QR clock kiosk — owner activation, expiry and revocation |
| BB-ATTEND-005 | Use the offline fallback safely — device claims and reconciliation |
| BB-ATTEND-006 | Configure and review attendance alerts — settings, decisions and limits |
| BB-ATTEND-007 | Clock, review location and correct reported time — immutable corrections/edit locks |
| BB-TIME-001 | Review, approve and finalise time — elapsed/worked/paid definitions and invalid entries |
| BB-TIME-002 | Review, approve and finalise time — weekly filters, source events and bulk locks |
| BB-TIME-003 | Clock, review location and correct reported time — employee requests and manager decisions |
| BB-TIME-004 | Review, approve and finalise time — department approval, self-review and stale approval |
| BB-TIME-005 | Review, approve and finalise time — whole-venue finalisation/reopening |
| BB-TIME-006 | Prepare CSV, reconcile exports and map employees — batch/history/source references |
| BB-PAY-001 | Prepare CSV, reconcile exports and map employees — canonical snapshots; no separate employee action |
| BB-PAY-002 | Prepare CSV, reconcile exports and map employees — generic CSV and reconciliation |
| BB-PAY-003 | Prepare CSV, reconcile exports and map employees — explicit destination/employee mapping |
| BB-SHIFTS-001 | Open shifts and swaps — offer audience/expiry |
| BB-SHIFTS-002 | Open shifts and swaps — employee claim/decline |
| BB-SHIFTS-003 | Open shifts and swaps — manager confirmation and competing claims |
| BB-SHIFTS-004 | Open shifts and swaps — two-party consent and scoped review |
| BB-COMMS-002 | For employees — Notifications and distinction from task decisions |
| BB-RULES-001 | Maintain profiles, qualifications and invitations — effective-dated employment metadata |
| BB-REPORT-001 | Hours and labour — owners — definitions, filtering, reconciliation and illustrative costs |
| BB-SAAS-004 | For employees — Mobile and keyboard use; engineering performance work has no separate user operation |
| BB-BRAND-001 | No app workflow: operational [brand inventory and release guidance](../branding/README.md); final identity unapproved |
| BB-DOC-001 | This guide and coverage index; no separate application operation or new Help Center |

**Document ownership:** Main Roadmap feature agent maintains user-facing guidance with each completed feature. Update this guide and any relevant help UI when workflows change; indicate unavailable or blocked capabilities explicitly.

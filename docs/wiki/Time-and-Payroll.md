# Attendance, timesheets and payroll preparation

[← Wiki home](Home.md) · [Venue operations →](Venue-Operations.md)

## From a clock event to approved hours

```text
Employee clock in / break / clock out
               ↓
Immutable source events + correction/audit history
               ↓
Worked-time calculation and exceptions
               ↓
Department-scoped timesheet review / approval
               ↓
Whole-venue payroll-period finalisation
               ↓
Prepare approved-hours CSV batch
               ↓
Download / reconcile with external payroll system
```

## Attendance and correction

Employees can record clock-in/out and paid/unpaid breaks in supported scopes. Point-in-time location verification can be configured, but is not a universal continuous tracking service. Missing or inaccurate geolocation may result in an exception requiring management review. Corrections preserve source history rather than silently deleting the original event.

Venue attendance alerts can detect configurable late/missing/no-show signals when the owner enables monitoring and the scheduled worker runs. Alerts do **not** determine whether an employee should be paid or sanctioned.

## Timesheet review and period locks

Open **Timesheet review** (`/timesheets`). Select venue, week and employee filters. Compare published shifts, actual sessions and underlying clock/break records.

- **Elapsed time:** clock span.
- **Worked time:** elapsed time less all recorded breaks.
- **Paid time:** effective time less unpaid breaks, including recorded paid breaks.
- Invalid, incomplete or missing clocks should show an unavailable calculation, **not fabricated zero hours**.

Authorized department managers approve or return time within scope. Approval is not the same as the technical edit lock. A suitably authorized whole-venue reviewer finalizes an ended, eligible payroll period. Reopening requires a reason and subsequent reassessment/approval before refinalization.

## Generic approved-hours CSV

Only eligible **finalised and approved** source sessions enter an authorized export batch. The export has its own batch/history identifiers and canonical attendance/approval/finalisation references. Previously exported sessions should not be silently exported again; subsequent changes require traceable reconciliation outside Butterbox.

**Critical:** Downloading a CSV is not sending it to a payroll provider. Import, wages, award compliance and adjustment handling happen separately and must be independently verified. Reimporting an identical batch can cause duplicate payment.

## Reports

- **Hours & labour:** owner-only reporting of scheduled hours, approved worked time, approved paid time and optional *illustrative* hourly-rate cost estimate.
- **Overtime and exceptions:** permitted managers review overlap signals, missing clock events and comparisons against a user-specified threshold. It does not calculate award/statutory overtime.
- **Owner CSV reports:** documentation describes roster/attendance CSV in isolated Development; verify deployment availability before depending on it.

## Not a payroll engine

Butterbox does **not** certify gross pay, modern award interpretation, superannuation, tax, deductions, penalties, wage entitlements or live provider delivery. Its Beta-oriented handoff is approved hours/time data only.

**Source:** [User Guide: timesheets and payroll](../USER_GUIDE.md#timesheets-and-payroll-preparation), [hours and labour](../USER_GUIDE.md#hours-and-labour--owners), [overtime and exceptions](../USER_GUIDE.md#overtime-and-exceptions--managers).

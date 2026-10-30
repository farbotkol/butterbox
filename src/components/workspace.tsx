"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown,
  ChevronLeft, ChevronRight, Clock3, Coffee, LayoutDashboard, Layers3,
  LoaderCircle, LogOut, MapPin, Menu, Plus, Send, ShieldCheck, Sparkles,
  Users, X,
} from "lucide-react";
import { deleteShiftAction, logoutAction, publishRosterAction, saveShiftAction } from "@/app/actions";
import { canManage, scheduledHours, shiftSchema, type ActionResult, type AppData, type Shift, type ShiftInput } from "@/lib/domain";
import { addDays, dateLabel, localDate, localInput, localToInstant, monday, timeLabel } from "./time";

type View = "dashboard" | "roster" | "team";
type EditorState = { shift?: Shift; date: string };
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
const number = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 1 });

export default function Workspace({ data, initialView = "dashboard" }: { data: AppData; initialView?: View }) {
  const router = useRouter();
  const [venueId, setVenueId] = useState(data.venues[0]?.id ?? "");
  const venue = data.venues.find(item => item.id === venueId);
  const timezone = venue?.timezone ?? "UTC";
  const departments = data.departments.filter(item => item.venue_id === venueId);
  const [departmentId, setDepartmentId] = useState("");
  const selectedDepartment = departments.find(item => item.id === departmentId);
  const today = localDate(new Date(), timezone);
  const [week, setWeek] = useState(monday(today));
  const [mobileNav, setMobileNav] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const isEmployee = data.session.role === "employee";
  const manageable = departments.filter(department => canManage(data.session, department));
  const canEdit = manageable.length > 0;
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const weekEnd = addDays(week, 7);
  const shifts = data.shifts.filter(shift => shift.venue_id === venueId &&
    (!departmentId || shift.department_id === departmentId) &&
    localDate(shift.starts_at, timezone) >= week && localDate(shift.starts_at, timezone) < weekEnd &&
    (!isEmployee || (shift.employee_id === data.session.employeeId && shift.status === "published")));
  const published = shifts.filter(shift => shift.status === "published");
  const drafts = shifts.filter(shift => shift.status === "draft");
  const unassigned = shifts.filter(shift => !shift.employee_id);
  const team = data.employees.filter(employee => departments.some(department =>
    (!departmentId || department.id === departmentId) && employee.department_ids.includes(department.id)));
  const todayShifts = shifts.filter(shift => localDate(shift.starts_at, timezone) === today);
  const activeTeam = new Set(shifts.map(shift => shift.employee_id).filter(Boolean)).size;
  const employeeName = (id: string | null) => data.employees.find(employee => employee.id === id)?.display_name ?? (id ? "Team member" : "Open shift");
  const roleName = (id: string) => data.jobRoles.find(role => role.id === id)?.name ?? "Role";
  const departmentName = (id: string) => data.departments.find(department => department.id === id)?.name ?? "Department";
  const run = (action: () => Promise<ActionResult>) => {
    setResult({});
    startTransition(async () => {
      try {
        const response = await action();
        setResult(response);
        if (!response.error) router.refresh();
      } catch {
        setResult({ error: "We couldn’t complete that request. Check your connection and try again." });
      }
    });
  };
  const moveWeek = (count: number) => { setWeek(addDays(week, count * 7)); setResult({}); };
  const publishSelectedWeek = async (): Promise<ActionResult> => {
    if (!selectedDepartment) return { error: "Choose a department to publish its roster." };
    let start: string;
    let end: string;
    try {
      start = localToInstant(`${week}T00:00`, timezone);
      end = localToInstant(`${weekEnd}T00:00`, timezone);
    } catch (issue) {
      return { error: issue instanceof Error ? issue.message : "Unable to determine this week’s timezone boundaries." };
    }
    return publishRosterAction({ venueId, departmentId: selectedDepartment.id, weekStart: start, weekEnd: end });
  };
  const openNew = (date = week) => setEditor({ date });
  const firstName = data.session.displayName.split(" ")[0] || "there";

  const shiftCard = (shift: Shift, compact = false) => {
    const editable = shift.status === "draft" && manageable.some(department => department.id === shift.department_id);
    const content = <><span className="shift-time">{timeLabel(shift.starts_at, timezone)} – {timeLabel(shift.ends_at, timezone)}{localDate(shift.ends_at, timezone) !== localDate(shift.starts_at, timezone) && <small> +1 day</small>}</span><span className="shift-role">{roleName(shift.role_id)}</span>{!compact && <span className="shift-person">{employeeName(shift.employee_id)}</span>}<span className="shift-meta">{shift.status === "draft" ? "Draft" : "Published"}{shift.break_minutes > 0 ? ` · ${shift.break_minutes}m break` : ""}</span></>;
    const className = `shift-card ${shift.status} ${!shift.employee_id ? "open-shift" : ""}`;
    return editable ? <button key={shift.id} className={className} onClick={() => setEditor({ shift, date: localDate(shift.starts_at, timezone) })} aria-label={`Edit ${employeeName(shift.employee_id)}, ${dateLabel(localDate(shift.starts_at, timezone))}, ${timeLabel(shift.starts_at, timezone)} draft shift`}>{content}</button> : <div key={shift.id} className={className}>{content}</div>;
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? "nav-open" : ""}`}>
        <Link href="/" className="brand"><span className="brand-mark"><Layers3 size={22} /></span>butterbox<span className="brand-period">.</span></Link>
        <div className="workspace-label"><span className="workspace-avatar">{initials(data.business.name)}</span><div><strong>{data.business.name}</strong><span>Your workspace</span></div></div>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {[{ href: "/", view: "dashboard", label: "Overview", Icon: LayoutDashboard }, { href: "/roster", view: "roster", label: isEmployee ? "My schedule" : "Roster", Icon: CalendarDays }, { href: "/team", view: "team", label: "Team", Icon: Users }].map(({ href, view, label, Icon }) => <Link key={view} className={`nav-link ${initialView === view ? "active" : ""}`} href={href} aria-current={initialView === view ? "page" : undefined}><Icon size={19} /><span>{label}</span>{view === "roster" && drafts.length > 0 && <span className="nav-count">{drafts.length}</span>}</Link>)}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-note"><span className="little-spark"><Sparkles size={18} /></span><strong>A little more organised.</strong><p>A lot more time for your people.</p></div><div className="sidebar-connection"><span className="status-dot" />{data.demo ? "Demo workspace" : "Connected workspace"}</div><div className="profile"><span className="avatar">{initials(data.session.displayName)}</span><div><strong>{data.session.displayName}</strong><span>{data.session.role.replaceAll("_", " ")}</span></div><form action={logoutAction}><button className="icon-button" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></form></div></div>
      </aside>
      <div className="main-shell">
        <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={21} /></button><span>Workspace</span><ChevronRight size={14} /><strong>{initialView === "dashboard" ? "Overview" : initialView === "roster" ? "Roster" : "Team"}</strong></div><div className="topbar-right"><span className="today-date">{dateLabel(today, { weekday: "long", day: "numeric", month: "long" })}</span><span className="topbar-divider" /><span className="avatar small">{initials(data.session.displayName)}</span></div></header>
        <main className="workspace-main" id="main-content">
          <div className="page-heading"><div><div className="eyebrow">{initialView === "dashboard" ? "LET’S MAKE IT A GOOD ONE" : initialView === "roster" ? "A LITTLE PLANNING GOES A LONG WAY" : "THE PEOPLE BEHIND IT ALL"}</div><h1>{initialView === "dashboard" ? `Hey ${firstName}, welcome back` : initialView === "roster" ? (isEmployee ? "Your working week" : "The weekly roster") : "Good people. Great team."}<span className="heading-dot">.</span></h1><p>{initialView === "dashboard" ? "Here’s what’s happening with your team this week." : initialView === "roster" ? "The right people, in the right place, at the right time." : "A familiar face for every part of your business."}</p></div>{canEdit && initialView !== "team" && <button className="button primary" onClick={() => openNew()}><Plus size={17} />Create shift</button>}</div>
          <div className="context-bar"><label className="venue-select"><MapPin size={16} /><span className="sr-only">Venue</span><select value={venueId} onChange={event => { setVenueId(event.target.value); setDepartmentId(""); setResult({}); }}>{data.venues.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></label><span className="context-divider" /><label className="department-select"><span className="sr-only">Department</span><select value={departmentId} onChange={event => { setDepartmentId(event.target.value); setResult({}); }}><option value="">All departments</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></label><span className="timezone"><Clock3 size={13} />{timezone}</span></div>
          {result.error && <div role="alert" className="notice error">{result.error}</div>}{result.success && <div role="status" className="notice success"><Check size={16} />{result.success}</div>}

          {initialView === "dashboard" && <>
            <section className="welcome-banner"><div><span className="banner-tag"><span className="status-dot" />YOUR WEEK AT A GLANCE</span><h2>A smooth week starts<br />with a solid plan.</h2><p>{isEmployee ? "Your published shifts, all in one place. You’ve got this." : drafts.length ? `${drafts.length} draft ${drafts.length === 1 ? "shift is" : "shifts are"} waiting in this week’s roster. A little planning, a lot less juggling.` : "A clear roster. A connected team. More room for the good stuff."}</p><Link className="banner-link" href="/roster">{isEmployee ? "See my schedule" : "Let’s look at the roster"}<ArrowRight size={16} /></Link></div><div className="banner-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-calendar"><div className="art-calendar-top"><span /><span /></div><div className="art-calendar-grid">{Array.from({ length: 9 }, (_, i) => <span key={i} className={i === 4 ? "art-selected" : ""}>{i === 4 ? <Check size={20} /> : ""}</span>)}</div></div><span className="art-badge"><Sparkles size={23} /></span><span className="art-star">✳</span></div></section>
            <section className="metrics" aria-label="Scheduled totals for selected week">
              {[{ label: isEmployee ? "Your shifts" : "Scheduled shifts", value: shifts.length, note: `${published.length} published · ${drafts.length} draft`, Icon: CalendarDays, color: "lilac" }, { label: "Scheduled hours", value: `${number(scheduledHours(shifts))}h`, note: "After scheduled breaks", Icon: Clock3, color: "peach" }, { label: isEmployee ? "Days scheduled" : "Team on the roster", value: isEmployee ? new Set(shifts.map(shift => localDate(shift.starts_at, timezone))).size : activeTeam, note: isEmployee ? "Published shifts this week" : `Of ${team.length} team members`, Icon: Users, color: "blue" }, { label: isEmployee ? "Shifts today" : "Open shifts", value: isEmployee ? todayShifts.length : unassigned.length, note: isEmployee ? "In your venue’s timezone" : unassigned.length ? "Ready for the right person" : "Everyone has a place", Icon: isEmployee ? Coffee : Layers3, color: "green" }].map(({ label, value, note, Icon, color }) => <article className="metric-card" key={label}><div className="metric-top"><span>{label}</span><span className={`metric-icon ${color}`}><Icon size={18} /></span></div><strong>{value}</strong><p>{note}</p></article>)}
            </section>
            <div className="dashboard-columns"><section className="panel week-panel"><div className="panel-heading"><div><h2>This week, at a glance</h2><p>{dateLabel(week)} – {dateLabel(addDays(week, 6), { year: "numeric" })}</p></div><Link href="/roster" className="text-link">View roster<ArrowUpRight size={15} /></Link></div><div className="week-chart">{days.map(day => { const count = shifts.filter(shift => localDate(shift.starts_at, timezone) === day).length; const max = Math.max(1, ...days.map(date => shifts.filter(shift => localDate(shift.starts_at, timezone) === date).length)); return <div key={day} className={`chart-day ${day === today ? "is-today" : ""}`}><span className="chart-count">{count}</span><div className="chart-track"><div className="chart-fill" style={{ height: `${count / max * 100}%` }} /></div><strong>{dateLabel(day, { weekday: "short", day: undefined, month: undefined })}</strong><span>{dateLabel(day, { day: "numeric", month: undefined })}</span></div>; })}</div><div className="chart-foot"><span><span className="legend-dot" />Scheduled shifts</span><span>Week of {dateLabel(week)}</span></div></section>
            <section className="panel roster-status"><div className="panel-heading"><div><h2>Roster check-in</h2><p>A little clarity for the week ahead.</p></div><span className="soft-icon"><ShieldCheck size={20} /></span></div><div className="status-line"><span><span className="status-dot" />Published shifts</span><strong>{published.length}</strong></div><div className="status-line"><span><span className="status-dot amber" />Draft shifts</span><strong>{drafts.length}</strong></div><div className="status-line"><span><span className="status-dot purple" />Unassigned shifts</span><strong>{unassigned.length}</strong></div><div className="status-hint"><Coffee size={18} /><p>{drafts.length ? "Make your finishing touches, then publish by department from the roster." : "Keep your plans up to date so everyone knows where they need to be."}</p></div></section></div>
            <section className="panel today-panel"><div className="panel-heading"><div><h2>{isEmployee ? "Your shifts today" : "On the schedule today"}<span className="count-pill">{todayShifts.length}</span></h2><p>{dateLabel(today, { weekday: "long", day: "numeric", month: "long" })} · Scheduled, not live attendance</p></div><Link className="text-link" href="/roster">Full schedule<ArrowRight size={15} /></Link></div>{todayShifts.length ? <div className="today-list">{todayShifts.sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map(shift => <div className="today-row" key={shift.id}><span className="avatar pastel">{initials(employeeName(shift.employee_id))}</span><div className="today-person"><strong>{employeeName(shift.employee_id)}</strong><span>{roleName(shift.role_id)} · {departmentName(shift.department_id)}</span></div><span className="today-time"><Clock3 size={14} />{timeLabel(shift.starts_at, timezone)} – {timeLabel(shift.ends_at, timezone)}</span><span className={`badge ${shift.status}`}>{shift.status}</span></div>)}</div> : <EmptyState title="A little breathing room" text="No shifts scheduled for today in this selection." />}</section>
          </>}

          {initialView === "roster" && <section className="panel roster-panel"><div className="roster-toolbar"><div className="week-controls"><button className="icon-button" aria-label="Previous week" onClick={() => moveWeek(-1)}><ChevronLeft size={18} /></button><h2>{dateLabel(week)} – {dateLabel(addDays(week, 6), { year: "numeric" })}</h2><button className="icon-button" aria-label="Next week" onClick={() => moveWeek(1)}><ChevronRight size={18} /></button><button className="button secondary small-button" onClick={() => setWeek(monday(today))}>This week</button></div>{selectedDepartment && canManage(data.session, selectedDepartment) && data.session.permissions.includes("publish_roster") && <button className="button dark small-button" disabled={pending || !drafts.length} onClick={() => run(publishSelectedWeek)}>{pending ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}Publish {drafts.length > 0 ? `(${drafts.length})` : "roster"}</button>}</div>
            <div className="roster-caption"><span><span className="legend-dot" />Published <span className="legend-dot draft-dot" />Draft</span><span>{number(scheduledHours(shifts))} scheduled hours · {shifts.length} shifts</span></div>
            {!venue ? <EmptyState title="No venues available" text="Ask your administrator to add a venue to get started." /> : <div className="roster-scroll"><div className="roster-grid"><div className="roster-corner">Team member<span>{timezone}</span></div>{days.map(day => <div key={day} className={`roster-day ${day === today ? "day-today" : ""}`}><span>{dateLabel(day, { weekday: "short", day: undefined, month: undefined })}</span><strong>{dateLabel(day, { day: "numeric", month: undefined })}</strong>{day === today && <small>Today</small>}</div>)}
              {(isEmployee ? team.filter(employee => employee.id === data.session.employeeId) : team).map(employee => <RosterRow key={employee.id} name={employee.display_name} subtitle={number(scheduledHours(shifts.filter(shift => shift.employee_id === employee.id))) + "h scheduled"}>{days.map(day => <div className="roster-cell" key={day}>{shifts.filter(shift => shift.employee_id === employee.id && localDate(shift.starts_at, timezone) === day).map(shift => shiftCard(shift, true))}</div>)}</RosterRow>)}
              {!isEmployee && <RosterRow name="Open shifts" subtitle="Not yet assigned" open>{days.map(day => <div className="roster-cell" key={day}>{shifts.filter(shift => !shift.employee_id && localDate(shift.starts_at, timezone) === day).map(shift => shiftCard(shift, true))}{canEdit && <button className="add-cell" onClick={() => openNew(day)} aria-label={`Add shift on ${dateLabel(day)}`}><Plus size={14} /><span>Add shift</span></button>}</div>)}</RosterRow>}
            </div></div>}
            {!shifts.length && <EmptyState title={isEmployee ? "Your week is still taking shape" : "A fresh week, ready to plan"} text={isEmployee ? "Published shifts will appear here when your manager shares the roster." : "Create your first shift to start bringing this week together."} />}
            {canEdit && !selectedDepartment && <p className="roster-info"><ShieldCheck size={15} />Select a department above to publish its draft shifts for this week.</p>}
          </section>}

          {initialView === "team" && <section className="panel team-panel"><div className="panel-heading"><div><h2>Your team<span className="count-pill">{team.length}</span></h2><p>People and role eligibility in your permitted departments.</p></div><span className="soft-icon"><Users size={20} /></span></div>{team.length ? <div className="team-grid">{team.map(employee => <article className="team-card" key={employee.id}><span className="avatar team-avatar">{initials(employee.display_name)}</span><h3>{employee.display_name}</h3><p>{employee.department_ids.map(departmentName).join(" · ")}</p><div className="role-tags">{employee.role_ids.map(id => <span key={id}>{roleName(id)}</span>)}</div></article>)}</div> : <EmptyState title="No team members here yet" text="Your permitted team members will appear in this space." />}</section>}
          <footer className="workspace-footer"><span><Layers3 size={14} /> A better working week.</span><p>Scheduled hours are not payroll. Attendance tracking is not yet available.</p><span>Made for hospitality <ArrowDownRight size={14} /></span></footer>
        </main>
      </div>
      {editor && venue && <ShiftEditor data={data} venueId={venueId} timezone={timezone} departments={manageable} initialDepartment={departmentId} editor={editor} close={() => setEditor(null)} saved={message => { setEditor(null); setResult({ success: message }); router.refresh(); }} />}
    </div>
  );
}

function RosterRow({ name, subtitle, children, open = false }: { name: string; subtitle: string; children: React.ReactNode; open?: boolean }) {
  return <><div className="roster-person"><span className={`avatar ${open ? "open-avatar" : ""}`}>{open ? <Users size={17} /> : initials(name)}</span><div><strong>{name}</strong><span>{subtitle}</span></div></div>{children}</>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span className="empty-icon"><CalendarDays size={23} /></span><h3>{title}</h3><p>{text}</p></div>;
}

function ShiftEditor({ data, venueId, timezone, departments, initialDepartment, editor, close, saved }: {
  data: AppData; venueId: string; timezone: string; departments: AppData["departments"];
  initialDepartment: string; editor: EditorState; close: () => void; saved: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const shift = editor.shift;
  const [department, setDepartment] = useState(shift?.department_id ?? (departments.some(item => item.id === initialDepartment) ? initialDepartment : departments[0]?.id ?? ""));
  const roles = data.jobRoles.filter(role => role.department_id === department);
  const [role, setRole] = useState(shift?.role_id ?? roles[0]?.id ?? "");
  const [employee, setEmployee] = useState(shift?.employee_id ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const eligible = data.employees.filter(person => person.department_ids.includes(department) && person.role_ids.includes(role));
  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);
  function submit(form: FormData) {
    setError("");
    let input: ShiftInput;
    try {
      input = shiftSchema.parse({
        ...(shift ? { id: shift.id, version: shift.version } : {}),
        venue_id: venueId, department_id: department, role_id: role, employee_id: employee || null,
        starts_at: localToInstant(String(form.get("starts_at")), timezone),
        ends_at: localToInstant(String(form.get("ends_at")), timezone),
        break_minutes: Number(form.get("break_minutes")),
      });
    } catch (issue) {
      const message = issue && typeof issue === "object" && "issues" in issue
        ? (issue as { issues: { message: string }[] }).issues[0]?.message
        : issue instanceof Error ? issue.message : "";
      setError(message || "Check the shift details and try again.");
      return;
    }
    startTransition(async () => {
      try {
        const response = await saveShiftAction(input);
        if (response.error) setError(response.error);
        else saved(response.success || "Draft shift saved. Publish the roster when you’re ready.");
      } catch { setError("Couldn’t save this shift. Check your connection and try again."); }
    });
  }
  function remove() {
    if (!shift) return;
    startTransition(async () => {
      try {
        const response = await deleteShiftAction(shift.id, shift.version);
        if (response.error) setError(response.error);
        else saved(response.success || "Draft shift deleted.");
      } catch { setError("Couldn’t delete this shift. Please try again."); }
    });
  }
  return <dialog ref={dialog} className="shift-dialog" aria-labelledby="shift-dialog-title" aria-describedby="shift-dialog-description" onCancel={event => { event.preventDefault(); if (!pending) close(); }}>
    <div className="dialog-heading"><div><span className="eyebrow">MAKE ROOM FOR A GOOD SHIFT</span><h2 id="shift-dialog-title">{shift ? "Edit draft shift" : "Create a shift"}</h2></div><button className="icon-button" onClick={close} disabled={pending} aria-label="Close shift editor"><X size={21} /></button></div><p id="shift-dialog-description" className="muted dialog-description">Times are in <strong>{timezone}</strong>. New shifts stay in draft until published.</p>
    <form action={submit}><fieldset disabled={pending} className="shift-fields"><label>Department<select value={department} onChange={event => { const id = event.target.value; setDepartment(id); setRole(data.jobRoles.find(item => item.department_id === id)?.id ?? ""); setEmployee(""); }}>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Role<select required value={role} onChange={event => { setRole(event.target.value); setEmployee(""); }}><option value="" disabled>Choose a role</option>{roles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field-full">Team member<select value={employee} onChange={event => setEmployee(event.target.value)}><option value="">Unassigned — open shift</option>{eligible.map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select><span className="field-hint">Only team members eligible for this department and role are shown.</span></label><label>Starts<input name="starts_at" type="datetime-local" required defaultValue={shift ? localInput(shift.starts_at, timezone) : `${editor.date}T09:00`} /></label><label>Ends<input name="ends_at" type="datetime-local" required defaultValue={shift ? localInput(shift.ends_at, timezone) : `${editor.date}T17:00`} /></label><label className="field-full">Scheduled break (minutes)<input name="break_minutes" type="number" min="0" max="480" step="1" defaultValue={shift?.break_minutes ?? 30} required /><span className="field-hint">Deducted from scheduled hours. This is not a recorded or paid break.</span></label></fieldset>
      {error && <p className="notice error" role="alert">{error}</p>}
      {confirmDelete && <div className="notice error"><p>Delete this draft shift? This cannot be undone.</p><button className="button danger small-button" type="button" onClick={remove} disabled={pending}>Yes, delete shift</button><button className="button secondary small-button" type="button" onClick={() => setConfirmDelete(false)} disabled={pending}>Keep shift</button></div>}
      <div className="dialog-actions">{shift && !confirmDelete && <button type="button" className="delete-link" disabled={pending} onClick={() => setConfirmDelete(true)}>Delete shift</button>}<span className="action-spacer" /><button type="button" className="button secondary" onClick={close} disabled={pending}>Cancel</button><button className="button primary" disabled={pending || !role}>{pending ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}Save draft</button></div>
    </form>
  </dialog>;
}

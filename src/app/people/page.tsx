import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { employmentBases, isEmploymentBasis } from "@/lib/employment-rule-metadata";
import { isPayrollUuid } from "@/lib/generic-payroll-exports";
import { helpHref } from "@/lib/help";
import { readAllPages } from "@/lib/paginated-rows";
import { parsePeopleFilters, peopleHref } from "@/lib/people-directory";
import { PeopleFeedback } from "./people-feedback";
import { requirePeopleWorkspace, type PeopleSearch } from "./people-workspace";

const pageSize = 25;

type DirectoryPerson = {
  id: string;
  name: string;
  email: string | null;
  department_name: string | null;
  role_title: string | null;
  primary_role_name: string | null;
  employment_type: string | null;
  active: boolean;
  invitation_state: "linked" | "pending" | "expired" | "not_invited" | "unavailable";
};

function isDirectoryPerson(value: unknown): value is DirectoryPerson {
  const isRecord = (item: unknown): item is Record<string, unknown> =>
    typeof item === "object" && item !== null && !Array.isArray(item);
  if (!isRecord(value)) return false;
  const row = value;
  const nullableText = (item: unknown) => item === null || typeof item === "string";
  return isPayrollUuid(row.id) && typeof row.name === "string" &&
    nullableText(row.email) && nullableText(row.department_name) && nullableText(row.role_title) &&
    nullableText(row.primary_role_name) && (row.employment_type === null || isEmploymentBasis(row.employment_type)) &&
    typeof row.active === "boolean" && typeof row.invitation_state === "string" &&
    ["linked", "pending", "expired", "not_invited", "unavailable"].includes(row.invitation_state);
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] ?? "").join("").toUpperCase();
}

const invitationLabels: Record<DirectoryPerson["invitation_state"], string> = {
  linked: "Account linked",
  pending: "Invitation pending",
  expired: "Invitation expired",
  not_invited: "Not invited",
  unavailable: "Account unavailable",
};

export default async function PeoplePage({ searchParams }: { searchParams: Promise<PeopleSearch> }) {
  const search = await searchParams;
  const workspace = await requirePeopleWorkspace(search);
  const filters = parsePeopleFilters(search);
  const [venues, departments, activeCount, invitationsCount] = await Promise.all([
    readAllPages((from, to) => workspace.supabase.from("venues")
      .select("id, name", { count: "exact" }).eq("business_id", workspace.business.id)
      .order("name").order("id").range(from, to), (venue) => venue.id),
    readAllPages((from, to) => workspace.supabase.from("departments")
      .select("id, name, active", { count: "exact" }).eq("business_id", workspace.business.id)
      .eq("venue_id", workspace.venue.id).order("name").order("id").range(from, to), (department) => department.id),
    workspace.supabase.from("employees").select("id", { count: "exact", head: true })
      .eq("business_id", workspace.business.id).eq("venue_id", workspace.venue.id).eq("active", true),
    workspace.supabase.from("staff_invitations").select("id", { count: "exact", head: true })
      .eq("business_id", workspace.business.id).eq("venue_id", workspace.venue.id)
      .eq("status", "pending").gt("expires_at", new Date().toISOString()),
  ]);
  const invalidDepartment = filters?.department &&
    !departments.error && !departments.data?.some((department) => department.id === filters.department);
  let rows: DirectoryPerson[] | null = null;
  let count: number | null = null;
  let pageUnavailable = false;
  let queryError: { code?: string; message: string } | null = null;
  if (filters && !invalidDepartment) {
    const makeQuery = () => {
      let query = workspace.supabase.rpc("list_people_directory", {
        p_business_id: workspace.business.id, p_venue_id: workspace.venue.id,
        p_department_id: filters.department || null, p_search: filters.q,
        p_role: filters.role, p_status: filters.status,
      }, { count: "exact" });
      if (filters.sort === "department") query = query.order("department_name", { nullsFirst: false });
      else if (filters.sort === "role") query = query.order("primary_role_name", { nullsFirst: false })
        .order("role_title", { nullsFirst: false });
      else if (filters.sort === "status") query = query.order("active", { ascending: false });
      return query.order("name").order("id");
    };
    const offset = (filters.page - 1) * pageSize;
    const result = await makeQuery().range(offset, offset + pageSize - 1);
    if (result.error?.code === "PGRST103" && filters.page > 1) {
      const first = await makeQuery().range(0, 0);
      queryError = first.error;
      count = first.count;
      pageUnavailable = !first.error && count !== null;
      rows = pageUnavailable ? [] : null;
    } else {
      queryError = result.error;
      count = result.count;
      rows = Array.isArray(result.data) && result.data.every(isDirectoryPerson) ? result.data : null;
    }
    if (!queryError && (rows === null || count === null)) {
      queryError = { code: "incomplete_result", message: "Directory data or its count was incomplete." };
    }
  }
  const loadError = venues.error || departments.error || activeCount.error || invitationsCount.error || queryError;
  if (loadError) console.error("Could not load the People directory.", { code: loadError.code, message: loadError.message });
  const baseFilters = filters ?? parsePeopleFilters({});
  if (!baseFilters) throw new Error("Default People filters are invalid.");
  const directoryHref = peopleHref(workspace.business.id, workspace.venue.id, baseFilters);
  const cleanHref = peopleHref(workspace.business.id, workspace.venue.id, { ...baseFilters, q: "", role: "",
    department: "", status: "all", sort: "name", page: 1 });
  const addHref = directoryHref.replace("/people?", "/people/new?");
  const field = "mt-2 block min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-ink";
  const hasFilters = Boolean(baseFilters.q || baseFilters.role || baseFilters.department || baseFilters.status !== "all");

  return <AppShell businessName={workspace.business.name} businessId={workspace.business.id}
    businessCount={workspace.businesses.length} venueId={workspace.venue.id} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold">Your people</h1>
        <p className="mt-2 text-sm text-muted">Find and manage people in {workspace.venue.name}.</p>
        {!loadError && activeCount.count !== null && invitationsCount.count !== null && <p className="mt-2 text-sm text-muted">
          {activeCount.count} visible active people in this venue · {invitationsCount.count} visible invitations awaiting action
        </p>}
      </div>
      {departments.data?.some((department) => department.active) && <Link href={addHref}
        className="inline-flex min-h-11 items-center rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">
        Add person
      </Link>}
    </div>
    <PeopleFeedback error={search.error} saved={search.saved} />
    <form action="/people" aria-label="Directory filters"
      className="mt-6 grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2 xl:grid-cols-3">
      <input type="hidden" name="business" value={workspace.business.id} />
      <label className="text-sm">Search team
        <input type="search" name="q" maxLength={100} defaultValue={baseFilters.q}
          placeholder="Name, contact or role" className={field} />
      </label>
      <label className="text-sm">Venue
        <select name="venue" defaultValue={workspace.venue.id} className={field}>
          {venues.data?.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
        </select>
      </label>
      <label className="text-sm">Department
        <select name="department" defaultValue={invalidDepartment ? "" : baseFilters.department} className={field}>
          <option value="">All departments</option>
          {departments.data?.map((department) => <option key={department.id} value={department.id}>
            {department.name}{department.active ? "" : " (inactive)"}
          </option>)}
        </select>
      </label>
      <label className="text-sm">Role (exact title or qualification)
        <input name="role" maxLength={80} defaultValue={baseFilters.role} className={field} />
      </label>
      <label className="text-sm">Status
        <select name="status" defaultValue={baseFilters.status} className={field}>
          <option value="all">All people</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <label className="text-sm">Sort by
        <select name="sort" defaultValue={baseFilters.sort} className={field}>
          <option value="name">Name</option>
          <option value="department">Primary department</option>
          <option value="role">Primary role / job title</option>
          <option value="status">Status</option>
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-3">
        <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 py-2 text-sm font-semibold text-white">Filter team</button>
        <Link href={cleanHref} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-ocean underline">
          Clear filters
        </Link>
      </div>
    </form>
    {!filters || invalidDepartment ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      These filters are invalid or unavailable. Clear them and choose a permitted department.
    </p> : loadError ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      Could not load the People directory. Refresh and check your access.
    </p> : rows && count !== null && <>
      <p role="status" className="mt-5 text-sm text-muted">
        {count} {count === 1 ? "person" : "people"} {hasFilters ? "match the applied filters" : "in this venue"}.
        {count > 0 && ` Page ${baseFilters.page}.`}
      </p>
      {pageUnavailable ? <p className="mt-4 text-sm">
        This page is no longer available. <Link href={peopleHref(workspace.business.id, workspace.venue.id, { ...baseFilters, page: 1 })}
          className="font-semibold text-ocean underline">Return to the first page</Link>.
      </p> : rows.length === 0 ? <p className="mt-4 rounded-xl border border-line bg-white p-4 text-sm">
        {hasFilters ? "No people match these filters." : "No people are in this venue yet."}
      </p> : <ol aria-label="People directory" className="mt-4 divide-y divide-line rounded-xl border border-line bg-white">
        {rows.map((person) => <li key={person.id}
          className="grid gap-3 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft-sea text-sm font-semibold text-ocean">
              {initials(person.name)}
            </span>
            <div className="min-w-0">
              <p className="break-words font-semibold">{person.name}</p>
              {person.email && <p className="break-all text-xs text-muted">{person.email}</p>}
            </div>
          </div>
          <div className="min-w-0 text-sm">
            <span className="text-xs text-muted">Primary department</span>
            <p className="break-words">{person.department_name ?? "Managed elsewhere"}</p>
          </div>
          <div className="min-w-0 text-sm">
            <span className="text-xs text-muted">Primary qualification</span>
            <p className="break-words">{person.primary_role_name ?? "Not set or unavailable"}</p>
            {person.role_title && <p className="break-words text-xs text-muted">Job title: {person.role_title}</p>}
          </div>
          <div className="text-sm">
            <p><span className={person.active ? "" : "rounded bg-amber-50 px-1.5 py-0.5 text-amber-900"}>
              {person.active ? "Active" : "Archived"}
            </span></p>
            <p className="text-xs text-muted">{person.employment_type && isEmploymentBasis(person.employment_type)
              ? employmentBases[person.employment_type] : "Employment unavailable"}</p>
            <p className="text-xs text-muted">{invitationLabels[person.invitation_state]}</p>
          </div>
          <Link href={peopleHref(workspace.business.id, workspace.venue.id, baseFilters, person.id)}
            aria-label={`View profile for ${person.name}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ocean">
            View profile
          </Link>
        </li>)}
      </ol>}
      {!pageUnavailable && <nav aria-label="People directory pages" className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-ocean">
        {baseFilters.page > 1 && <Link className="min-h-11 py-3"
          href={peopleHref(workspace.business.id, workspace.venue.id, { ...baseFilters, page: baseFilters.page - 1 })}>
          Previous page
        </Link>}
        {baseFilters.page * pageSize < count && <Link className="min-h-11 py-3"
          href={peopleHref(workspace.business.id, workspace.venue.id, { ...baseFilters, page: baseFilters.page + 1 })}>
          Next page
        </Link>}
      </nav>}
    </>}
    <Link href={helpHref("people", workspace.business.id, workspace.venue.id)} className="mt-6 inline-block text-sm font-semibold text-ocean underline">
      Help with managing people
    </Link>
  </AppShell>;
}

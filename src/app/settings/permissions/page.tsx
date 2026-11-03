import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { withBusiness } from "@/lib/business-selection";
import { helpHref } from "@/lib/help";
import {
  filterAndSortPermissions, parsePermissionsFilters, PERMISSION_ROLES,
  PERMISSIONS_PAGE_SIZE, permissionRoleLabel, permissionScopeLabel, permissionsFiltersAvailable, permissionsHref,
} from "@/lib/permissions-directory";
import { PermissionsFeedback } from "./permissions-feedback";
import {
  loadPermissionsData, requirePermissionsWorkspace, type PermissionsSearch,
} from "./permissions-workspace";

type Props = { searchParams: Promise<PermissionsSearch> };

export default async function BusinessPermissionsPage({ searchParams }: Props) {
  const search = await searchParams;
  const workspace = await requirePermissionsWorkspace(search);
  const businessId = workspace.business.id;
  const parsedFilters = parsePermissionsFilters(search);
  const { members, venues, departments } = await loadPermissionsData(workspace);
  const roles = Array.from(new Set<string>([
    ...PERMISSION_ROLES, ...members.map((member) => member.role),
    ...(parsedFilters && parsedFilters.role !== "all" ? [parsedFilters.role] : []),
  ]));
  const filters = parsedFilters && permissionsFiltersAvailable(parsedFilters, roles, venues, departments) ? parsedFilters : null;
  const filtered = filters ? filterAndSortPermissions(members, filters, venues, departments) : [];
  const pages = Math.max(1, Math.ceil(filtered.length / PERMISSIONS_PAGE_SIZE));
  const currentFilters = filters && { ...filters, page: Math.min(filters.page, pages) };
  const visible = currentFilters
    ? filtered.slice((currentFilters.page - 1) * PERMISSIONS_PAGE_SIZE, currentFilters.page * PERMISSIONS_PAGE_SIZE)
    : [];
  const venueOptions = [{ id: "unscoped", name: "No venue restriction" }, ...venues];
  const departmentOptions = [{ id: "unscoped", name: "No department restriction" }, ...departments];
  const input = "mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";

  return <AppShell email={workspace.user.email ?? ""} businessName={workspace.business.name}
    businessCount={workspace.businesses.length} businessId={businessId}
    venueName={workspace.venue.name} role={workspace.membership.role}>
    <div className="mx-auto max-w-7xl">
      <h1 className="text-3xl font-semibold">Business permissions</h1>
      <p className="mt-2 break-words text-sm text-muted">Business: {workspace.business.name}</p>
      <p className="mt-1 text-sm text-muted">Find a member, review their access and edit one permission at a time.</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted">
          Only owners can manage business permissions. Changing a person&apos;s access does not change their staff profile.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href={helpHref("permissions", businessId)} className="text-sm font-semibold text-ocean underline">
            Help with permissions
          </Link>
          <Link href={withBusiness("/", businessId)} className="text-sm font-semibold text-ocean underline">
            Back to dashboard
          </Link>
        </div>
      </div>
      <PermissionsFeedback error={filters ? search.error : "filter"} saved={search.saved} />
      {!filters ? <div className="mt-5">
        <Link href={withBusiness("/settings/permissions", businessId)} className="font-semibold text-ocean underline">
          Reset filters
        </Link>
      </div> : <>
        <form action="/settings/permissions" aria-label="Member directory filters" className="mt-5 rounded-xl border border-line bg-white p-4">
          <input type="hidden" name="business" value={businessId} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm font-medium">Search members
              <input className={input} name="q" defaultValue={filters.q} maxLength={100} type="search" placeholder="Name or email" />
            </label>
            <label className="text-sm font-medium">Business role
              <select className={input} name="role" defaultValue={filters.role}>
                <option value="all">All roles</option>
                {roles.map((role) => <option key={role} value={role}>{permissionRoleLabel(role)}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Venue
              <select className={input} name="venue" defaultValue={filters.venue}>
                <option value="all">All venues</option>
                {venueOptions.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Department
              <select className={input} name="department" defaultValue={filters.department}>
                <option value="all">All departments</option>
                {departmentOptions.map((department) => <option key={department.id} value={department.id}>
                  {department.name}{"venue_id" in department ? ` (${permissionScopeLabel(department.venue_id, venues, "venue")})` : ""}
                </option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Sort by
              <select className={input} name="sort" defaultValue={filters.sort}>
                <option value="identity">Name or email</option>
                <option value="role">Role</option>
                <option value="venue">Venue</option>
                <option value="department">Department</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button type="submit" className="min-h-11 rounded-lg bg-ocean px-4 font-semibold text-white">Apply filters</button>
            <Link href={withBusiness("/settings/permissions", businessId)} className="text-sm font-semibold text-ocean underline">
              Reset filters
            </Link>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Members</h2>
          <p aria-live="polite" className="text-sm text-muted">
            {filtered.length} {filtered.length === 1 ? "member" : "members"}{filtered.length !== members.length ? ` of ${members.length}` : ""}
          </p>
        </div>
        {!currentFilters || visible.length === 0 ? <p className="mt-3 rounded-xl border border-line bg-white p-5 text-sm text-muted">
          {members.length === 0 ? "No business members are available." : "No members match these filters. Try resetting them."}
        </p> : <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
          <table className="hidden w-full table-fixed text-left text-sm md:table">
            <thead className="bg-soft-sea text-brand-charcoal"><tr>
              <th scope="col" className="w-[30%] px-4 py-3">Member</th>
              <th scope="col" className="w-[20%] px-4 py-3">Business role</th>
              <th scope="col" className="w-[20%] px-4 py-3">Venue</th>
              <th scope="col" className="w-[20%] px-4 py-3">Department</th>
              <th scope="col" className="w-[10%] px-4 py-3"><span className="sr-only">Details</span></th>
            </tr></thead>
            <tbody>{visible.map((member) => <tr key={member.user_id} className="border-t border-line">
              <td className="break-words px-4 py-3">
                <p className="font-semibold">{member.full_name || member.email || "Member"}</p>
                {member.full_name && member.email && <p className="mt-1 text-muted">{member.email}</p>}
              </td>
              <td className="break-words px-4 py-3">{permissionRoleLabel(member.role)}</td>
              <td className="break-words px-4 py-3">{permissionScopeLabel(member.venue_id, venues, "venue")}</td>
              <td className="break-words px-4 py-3">{permissionScopeLabel(member.department_id, departments, "department")}</td>
              <td className="px-4 py-3"><Link className="font-semibold text-ocean underline"
                aria-label={`View access for ${member.full_name || member.email || "member"}`}
                href={permissionsHref(businessId, currentFilters, member.user_id)}>View</Link></td>
            </tr>)}</tbody>
          </table>
          <ul className="divide-y divide-line md:hidden">{visible.map((member) => <li key={member.user_id} className="p-4">
            <p className="break-words font-semibold">{member.full_name || member.email || "Member"}</p>
            {member.full_name && member.email && <p className="mt-1 break-all text-sm text-muted">{member.email}</p>}
            <p className="mt-2 break-words text-sm">{permissionRoleLabel(member.role)} · {permissionScopeLabel(member.venue_id, venues, "venue")}</p>
            <p className="mt-1 break-words text-sm text-muted">{permissionScopeLabel(member.department_id, departments, "department")}</p>
            <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-ocean underline"
              aria-label={`View access for ${member.full_name || member.email || "member"}`}
              href={permissionsHref(businessId, currentFilters, member.user_id)}>View access</Link>
          </li>)}</ul>
        </div>}
        {currentFilters && pages > 1 && <nav aria-label="Member pages" className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          {currentFilters.page > 1 && <Link className="min-h-11 content-center font-semibold text-ocean underline"
            href={permissionsHref(businessId, { ...currentFilters, page: currentFilters.page - 1 })}>Previous</Link>}
          <span>Page {currentFilters.page} of {pages}</span>
          {currentFilters.page < pages && <Link className="min-h-11 content-center font-semibold text-ocean underline"
            href={permissionsHref(businessId, { ...currentFilters, page: currentFilters.page + 1 })}>Next</Link>}
        </nav>}
      </>}
    </div>
  </AppShell>;
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { parseBusinessId, withBusiness } from "@/lib/business-selection";
import { helpHref } from "@/lib/help";
import {
  parsePermissionsFilters, permissionRoleLabel, permissionScopeLabel, permissionsHref,
} from "@/lib/permissions-directory";
import { PermissionEditor } from "../permission-editor";
import { PermissionsFeedback } from "../permissions-feedback";
import {
  loadPermissionsData, requirePermissionsWorkspace, type PermissionsSearch,
} from "../permissions-workspace";

type Props = { params: Promise<{ userId: string }>; searchParams: Promise<PermissionsSearch> };

export default async function MemberPermissionsPage({ params, searchParams }: Props) {
  const [{ userId }, search] = await Promise.all([params, searchParams]);
  const workspace = await requirePermissionsWorkspace(search);
  const filters = parsePermissionsFilters(search);
  if (!filters) redirect(withBusiness("/settings/permissions?error=filter", workspace.business.id));
  const normalizedUserId = parseBusinessId(userId);
  if (!normalizedUserId) notFound();
  const { members, venues, departments } = await loadPermissionsData(workspace);
  const member = members.find((candidate) => candidate.user_id === normalizedUserId);
  if (!member) notFound();

  return <AppShell email={workspace.user.email ?? ""} businessName={workspace.business.name}
    businessCount={workspace.businesses.length} businessId={workspace.business.id}
    venueName={workspace.venue.name} role={workspace.membership.role}>
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-semibold">Member access</h1>
      <p className="mt-2 text-sm text-muted">Review the current business role and scope before making changes.</p>
      <Link href={permissionsHref(workspace.business.id, filters)} className="inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
        Back to members
      </Link>
      <PermissionsFeedback error={search.error} saved={search.saved} />
      <section className="mt-4 rounded-xl border border-line bg-white p-5">
        <h2 className="break-words text-xl font-semibold">{member.full_name || member.email || "Member"}</h2>
        {member.full_name && member.email && <p className="mt-1 break-all text-sm text-muted">{member.email}</p>}
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div className="min-w-0"><dt className="font-semibold">Business</dt>
            <dd className="mt-1 break-words">{workspace.business.name}</dd></div>
          <div className="min-w-0"><dt className="font-semibold">Business role</dt>
            <dd className="mt-1 break-words">{permissionRoleLabel(member.role)}</dd></div>
          <div className="min-w-0"><dt className="font-semibold">Venue scope</dt>
            <dd className="mt-1 break-words">{permissionScopeLabel(member.venue_id, venues, "venue")}</dd></div>
          <div className="min-w-0"><dt className="font-semibold">Department scope</dt>
            <dd className="mt-1 break-words">{permissionScopeLabel(member.department_id, departments, "department")}</dd></div>
        </dl>
        <div className="mt-5 border-t border-line pt-4">
          <PermissionEditor businessId={workspace.business.id} member={member} venues={venues}
            departments={departments} filters={filters} />
        </div>
      </section>
      <p className="mt-4 text-sm text-muted">Permission changes are recorded in the existing{" "}
        <Link href={withBusiness("/settings/audit?source=business_memberships", workspace.business.id)}
          className="font-semibold text-ocean underline">sensitive action audit</Link>.
      </p>
      <Link href={helpHref("permissions", workspace.business.id)}
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-ocean underline">
        Help with permissions
      </Link>
    </div>
  </AppShell>;
}

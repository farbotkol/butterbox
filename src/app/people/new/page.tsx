import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InlineEditor } from "@/components/inline-editor";
import { readAllPages } from "@/lib/paginated-rows";
import { parsePeopleFilters, peopleHref } from "@/lib/people-directory";
import { EmployeeForm } from "../people-forms";
import { PeopleFeedback } from "../people-feedback";
import { requirePeopleWorkspace, type PeopleSearch } from "../people-workspace";

export default async function NewPersonPage({ searchParams }: { searchParams: Promise<PeopleSearch> }) {
  const search = await searchParams;
  const workspace = await requirePeopleWorkspace(search);
  const filters = parsePeopleFilters(search);
  if (!filters) {
    console.error("Invalid People directory context for a new person.");
    redirect(`/people?business=${encodeURIComponent(workspace.business.id)}&error=filter`);
  }
  const departments = await readAllPages((from, to) => workspace.supabase.from("departments")
    .select("id, name, active", { count: "exact" }).eq("business_id", workspace.business.id)
    .eq("venue_id", workspace.venue.id).eq("active", true).order("name").order("id").range(from, to),
  (department) => department.id);
  if (departments.error) console.error("Could not load departments for a new person.", departments.error);
  const context = { businessId: workspace.business.id, venueId: workspace.venue.id, filters };
  return <AppShell businessName={workspace.business.name} businessId={workspace.business.id}
    businessCount={workspace.businesses.length} venueId={workspace.venue.id} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>
    <Link href={peopleHref(workspace.business.id, workspace.venue.id, filters)}
      className="text-sm font-semibold text-ocean underline">Back to people</Link>
    <h1 className="mt-4 text-3xl font-semibold">Add person</h1>
    <p className="mt-3 text-sm text-muted">
      Add a person to an active department in {workspace.venue.name}. This does not create an account or send an invitation.
    </p>
    <PeopleFeedback error={search.error} saved={search.saved} />
    {departments.error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
      Could not load departments. Refresh and check your access.
    </p> : departments.data?.length ? <section aria-label="New employee" className="mt-6 rounded-xl border border-line bg-white p-5">
      <InlineEditor initialEditing label="Start adding a person" read={<p className="text-sm">No person was added.</p>}
        editor={<EmployeeForm departments={departments.data} context={context} createRequestId={randomUUID()} />} />
    </section> : <p className="mt-4 text-sm">No manageable active departments are available in this venue.</p>}
  </AppShell>;
}

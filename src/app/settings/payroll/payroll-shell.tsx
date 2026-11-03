import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import type { PayrollWorkspace } from "./payroll-workspace";

export function PayrollShell({ workspace, children }: { workspace: PayrollWorkspace; children: ReactNode }) {
  return <AppShell businessName={workspace.business.name} businessId={workspace.business.id}
    businessCount={workspace.businesses.length} venueName={workspace.venue.name}
    email={workspace.user.email ?? ""} role={workspace.membership.role}>{children}</AppShell>;
}

export function PayrollUnavailable() {
  return <main className="m-5">
    <h1 className="text-xl font-semibold">Payroll mappings unavailable</h1>
    <p role="alert">Check your business and venue access and try again.</p>
  </main>;
}

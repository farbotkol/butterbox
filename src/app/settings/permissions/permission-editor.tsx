"use client";

import { useEffect, useRef, useState } from "react";
import { assignMemberRoleAction } from "@/app/actions";
import { InlineEditor, SaveButton } from "@/components/inline-editor";
import {
  permissionRoleLabel, permissionScopeLabel, serializePermissionsFilters,
  type PermissionsFilters, type PermissionsMember,
} from "@/lib/permissions-directory";
import type { PermissionDepartment, PermissionVenue } from "./permissions-workspace";

const assignableRoles = ["owner", "general_manager", "foh_manager", "boh_manager", "employee"] as const;

export function PermissionEditor({
  businessId, member, venues, departments, filters,
}: {
  businessId: string; member: PermissionsMember; venues: PermissionVenue[];
  departments: PermissionDepartment[]; filters: PermissionsFilters;
}) {
  return <InlineEditor label="Edit permissions"
    read={<p className="text-sm text-muted">Review the current access above before making changes.</p>}
    editor={<PermissionEditForm businessId={businessId} member={member} venues={venues} departments={departments} filters={filters} />} />;
}

function PermissionEditForm({
  businessId, member, venues, departments, filters,
}: {
  businessId: string; member: PermissionsMember; venues: PermissionVenue[];
  departments: PermissionDepartment[]; filters: PermissionsFilters;
}) {
  const [role, setRole] = useState(member.role);
  const [venueId, setVenueId] = useState(member.venue_id ?? "");
  const [departmentId, setDepartmentId] = useState(member.department_id ?? "");
  const [reviewing, setReviewing] = useState(false);
  const editHeading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { editHeading.current?.focus(); }, []);
  useEffect(() => {
    if (reviewing) reviewHeading.current?.focus();
  }, [reviewing]);
  const isAssignable = assignableRoles.some((value) => value === role);
  const venueExists = venues.some((venue) => venue.id === venueId);
  const availableDepartments = departments.filter((department) => department.venue_id === venueId);
  const departmentExists = availableDepartments.some((department) => department.id === departmentId);
  const valid = isAssignable && (
    role === "owner" ? !venueId && !departmentId
      : role === "general_manager" ? venueExists && !departmentId
        : venueExists && departmentExists
  );
  const changed = role !== member.role || venueId !== (member.venue_id ?? "")
    || departmentId !== (member.department_id ?? "");
  const input = "mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";
  const updateRole = (value: string) => {
    setRole(value);
    if (value === "owner") {
      setVenueId("");
      setDepartmentId("");
    } else if (value === "general_manager") {
      setDepartmentId("");
    }
    setReviewing(false);
  };
  const updateVenue = (value: string) => {
    setVenueId(value);
    if (!departments.some((department) => department.id === departmentId && department.venue_id === value)) {
      setDepartmentId("");
    }
    setReviewing(false);
  };

  return <form action={assignMemberRoleAction} className="mt-4 space-y-4">
      <h3 ref={editHeading} tabIndex={-1} className="font-semibold">Edit permissions</h3>
      <input type="hidden" name="permissions_origin" value="detail" />
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="user_id" value={member.user_id} />
      <input type="hidden" name="expected_role" value={member.role} />
      <input type="hidden" name="expected_venue_id" value={member.venue_id ?? ""} />
      <input type="hidden" name="expected_department_id" value={member.department_id ?? ""} />
      <input type="hidden" name="directory_filters" value={serializePermissionsFilters(filters)} />
      {!isAssignable && <p className="rounded-lg bg-soft-sand p-3 text-sm">
        This member has a legacy role. It remains unchanged unless you select and save a supported role.
      </p>}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm font-medium">Business role
          <select className={input} name="role" value={role} onChange={(event) => updateRole(event.target.value)}>
            {!isAssignable && <option value={member.role}>{permissionRoleLabel(member.role)}</option>}
            {assignableRoles.map((option) => <option key={option} value={option}>{permissionRoleLabel(option)}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Venue
          <select className={input} name="venue_id" value={venueId}
            onChange={(event) => updateVenue(event.target.value)} disabled={role === "owner"}>
            <option value="">No venue restriction</option>
            {venueId && !venueExists && <option value={venueId}>Unavailable venue</option>}
            {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
          </select>
          {role === "owner" && <input type="hidden" name="venue_id" value="" />}
        </label>
        <label className="text-sm font-medium">Department
          <select className={input} name="department_id" value={departmentId}
            onChange={(event) => { setDepartmentId(event.target.value); setReviewing(false); }}
            disabled={role === "owner" || role === "general_manager"}>
            <option value="">No department restriction</option>
            {departmentId && !departmentExists && <option value={departmentId}>Unavailable department</option>}
            {availableDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
          {(role === "owner" || role === "general_manager") && <input type="hidden" name="department_id" value="" />}
        </label>
      </div>
      <p className="text-sm text-muted">
        Owners have business-wide access. General managers need a venue. FOH managers, BOH managers and employees need a venue and a department in that venue.
      </p>
      {!valid && <p className="text-sm text-red-800">Choose a supported role and the required valid scope to continue.</p>}
      {reviewing && valid && changed ? <div className="space-y-3 rounded-lg border border-line bg-soft-sand p-4">
        <h3 ref={reviewHeading} tabIndex={-1} className="font-semibold">Review access change</h3>
        <dl className="space-y-2 text-sm">
          <div><dt className="font-semibold">Current access</dt><dd className="break-words">
            {permissionRoleLabel(member.role)} · {permissionScopeLabel(member.venue_id, venues, "venue")} · {permissionScopeLabel(member.department_id, departments, "department")}
          </dd></div>
          <div><dt className="font-semibold">New access</dt><dd className="break-words">
            {permissionRoleLabel(role)} · {permissionScopeLabel(venueId || null, venues, "venue")} · {permissionScopeLabel(departmentId || null, departments, "department")}
          </dd></div>
        </dl>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmed" value="yes" required className="mt-1" />
          <span>I confirm this change to the member&apos;s business access.</span>
        </label>
        <SaveButton className="min-h-11 rounded-lg bg-ocean px-4 font-semibold text-white">
          Confirm and save permissions
        </SaveButton>
      </div> : <button type="button" disabled={!valid || !changed} onClick={() => setReviewing(true)}
        className="min-h-11 rounded-lg bg-ocean px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        Review change
      </button>}
  </form>;
}

export type InvitationPreview = {
  business_name: string;
  venue_name: string;
  department_name: string;
  employee_name: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
};

export type PendingStaffInvitation = {
  id: string;
  employee_id: string;
  email: string;
  expires_at: string;
  status: "pending" | "expired";
};

export function isInvitationId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function parsePendingStaffInvitation(value: unknown): PendingStaffInvitation | null {
  if (typeof value !== "object" || value === null ||
    !("id" in value) || typeof value.id !== "string" || !isInvitationId(value.id) ||
    !("employee_id" in value) || typeof value.employee_id !== "string" || !isInvitationId(value.employee_id) ||
    !("email" in value) || typeof value.email !== "string" || value.email.length === 0 ||
    !("expires_at" in value) || typeof value.expires_at !== "string" ||
      !Number.isFinite(Date.parse(value.expires_at)) ||
    !("status" in value) || (value.status !== "pending" && value.status !== "expired")) {
    return null;
  }
  return {
    id: value.id,
    employee_id: value.employee_id,
    email: value.email,
    expires_at: value.expires_at,
    status: value.status,
  };
}

export function parseInvitationPreview(value: unknown): InvitationPreview | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row: unknown = value[0];
  if (typeof row !== "object" || row === null ||
    !("business_name" in row) || typeof row.business_name !== "string" ||
    !("venue_name" in row) || typeof row.venue_name !== "string" ||
    !("department_name" in row) || typeof row.department_name !== "string" ||
    !("employee_name" in row) || typeof row.employee_name !== "string" ||
    !("status" in row) ||
      (row.status !== "pending" && row.status !== "accepted" &&
        row.status !== "revoked" && row.status !== "expired") ||
    !("expires_at" in row) || typeof row.expires_at !== "string" ||
    !Number.isFinite(Date.parse(row.expires_at))) {
    return null;
  }
  return {
    business_name: row.business_name,
    venue_name: row.venue_name,
    department_name: row.department_name,
    employee_name: row.employee_name,
    status: row.status,
    expires_at: row.expires_at,
  };
}

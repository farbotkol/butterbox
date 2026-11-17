export type EmployeeMobileResult = { valid: true; value: string | null } | { valid: false };

export function normalizeEmployeeMobile(input: unknown): EmployeeMobileResult {
  if (typeof input !== "string" || input.length > 64) return { valid: false };
  const value = input.trim();
  if (!value) return { valid: true, value: null };
  const compact = value.replace(/[\s().-]/g, "");
  if (/^04\d{8}$/.test(compact)) {
    return { valid: true, value: `+61${compact.slice(1)}` };
  }
  if (/^\+[1-9]\d{7,14}$/.test(compact) && !compact.startsWith("+610")) {
    return { valid: true, value: compact };
  }
  return { valid: false };
}

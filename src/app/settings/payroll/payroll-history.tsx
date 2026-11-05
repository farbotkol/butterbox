"use client";

import { useEffect } from "react";
import type { PayrollDirectoryFilters } from "@/lib/payroll-directory";

export function PayrollHistoryReset({ connectionId, filters }: {
  connectionId: string | undefined; filters: PayrollDirectoryFilters;
}) {
  useEffect(() => {
    // History can restore unsent form values that no longer match the rendered directory.
    function restoreForms() {
      const destination = document.querySelector<HTMLSelectElement>("#payroll-destination-form select[name=connection]");
      if (destination) destination.value = connectionId ?? "";
      for (const [name, value] of Object.entries({ q: filters.q, status: filters.status, sort: filters.sort })) {
        const field = document.querySelector<HTMLInputElement | HTMLSelectElement>(`#payroll-filter-form [name="${name}"]`);
        if (field) field.value = value;
      }
    }
    restoreForms();
    window.addEventListener("pageshow", restoreForms);
    return () => window.removeEventListener("pageshow", restoreForms);
  }, [connectionId, filters.q, filters.sort, filters.status]);
  return null;
}

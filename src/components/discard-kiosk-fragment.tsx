"use client";

import { useKioskFragment } from "@/hooks/use-kiosk-fragment";

export function DiscardKioskFragment() {
  useKioskFragment("q");
  return null;
}

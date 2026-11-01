"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { sessionEventKey } from "../../public/offline-attendance-shared.mjs";
import { announceSessionChange, discardOfflinePreparation } from "@/lib/session-notifications";

const publicAuthPages = new Set(["/login", "/signup", "/forgot-password"]);
const authFormPages = new Set([...publicAuthPages, "/reset-password"]);

export function SessionSync() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === sessionEventKey && event.newValue) {
        discardOfflinePreparation();
        if (!publicAuthPages.has(pathname)) window.location.replace("/login");
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && !authFormPages.has(pathname)) {
        router.refresh();
      }
    }

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pathname, router]);

  return null;
}

export function AnnounceSessionEnd() {
  useEffect(() => {
    announceSessionChange();
  }, []);

  return null;
}

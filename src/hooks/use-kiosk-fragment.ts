"use client";

import { useState, useSyncExternalStore } from "react";
import { isKioskCredential } from "@/lib/attendance-kiosk";

type Fragment =
  | { status: "loading" | "missing" | "invalid" }
  | { status: "valid"; value: string };

const loading: Fragment = { status: "loading" };

function fragmentStore(name: "activate" | "q") {
  let current: Fragment = loading;
  let read = false;
  return {
    subscribe(onChange: () => void) {
      if (!read) {
        read = true;
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.slice(1));
        const values = params.getAll(name);
        if (hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
        current = !hash ? { status: "missing" }
          : values.length === 1 && [...params.keys()].length === 1 && isKioskCredential(values[0])
            ? { status: "valid", value: values[0] } : { status: "invalid" };
        onChange();
      }
      return () => {};
    },
    getSnapshot: () => current,
    getServerSnapshot: () => loading,
  };
}

export function useKioskFragment(name: "activate" | "q") {
  const [store] = useState(() => fragmentStore(name));
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

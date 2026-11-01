"use client";

import { offlineContextKey, sessionEventKey } from "../../public/offline-attendance-shared.mjs";

export function discardOfflinePreparation() {
  try {
    window.sessionStorage.removeItem(offlineContextKey);
  } catch (error) {
    console.error("Could not remove offline preparation after a session change.", error);
  }
}

export function announceSessionChange() {
  discardOfflinePreparation();
  window.dispatchEvent(new Event(sessionEventKey));
  try {
    window.localStorage.setItem(sessionEventKey, crypto.randomUUID());
  } catch (error) {
    console.error("Could not notify other tabs that the session changed.", error);
  }
}

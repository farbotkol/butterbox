import {
  browserSessionIdentity, listOfflineClaims, offlineContextKey, openOfflineContext, saveOfflineClaim, sessionEventKey,
} from "./offline-attendance-shared.mjs";

document.querySelector("#offline-script-warning").hidden = true;
const unlockForm = document.querySelector("#offline-unlock");
const passphraseInput = document.querySelector("#offline-passphrase");
const capture = document.querySelector("#offline-capture");
const selection = document.querySelector("#offline-selection");
const errorMessage = document.querySelector("#offline-error");
const status = document.querySelector("#offline-status");
const claimsList = document.querySelector("#offline-claims");
const clockIn = document.querySelector("#offline-clock-in");
const clockOut = document.querySelector("#offline-clock-out");
const reconnect = document.querySelector("#offline-reconnect");
const lockButton = document.querySelector("#offline-lock");
const unlockButton = unlockForm.querySelector("button");
let context = null;
let generation = 0;
let recording = false;

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function lockScreen() {
  generation += 1;
  context = null;
  capture.hidden = true;
  unlockForm.hidden = false;
  passphraseInput.value = "";
  selection.replaceChildren();
  claimsList.replaceChildren();
  status.textContent = "";
}

function currentSessionMatches(current) {
  try {
    const identity = browserSessionIdentity(document.cookie, current.authCookieName);
    return identity?.actorId === current.actorId && identity.sessionId === current.sessionId;
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    console.error("Could not check the offline browser session.", error);
    return false;
  }
}

function requireCurrentSession(current) {
  if (context !== current) return false;
  if (currentSessionMatches(current)) return true;
  lockScreen();
  showError("The account session changed. Reconnect and prepare offline attendance again.");
  return false;
}

async function showClaims(current, expectedGeneration) {
  const claims = await listOfflineClaims(current.actorId, current.businessId);
  if (generation !== expectedGeneration || !requireCurrentSession(current)) return;
  claimsList.replaceChildren();
  for (const claim of claims) {
    const item = document.createElement("li");
    const time = document.createElement("time");
    time.dateTime = claim.claimedAt;
    time.textContent = new Date(claim.claimedAt).toLocaleString("en-AU");
    item.append(`${claim.eventType === "clock_in" ? "Clock in" : "Clock out"}${claim.venueId !== current.venueId
      ? " · another venue" : ""} · `, time);
    claimsList.append(item);
  }
  status.textContent = claims.length
    ? `${claims.length} claim${claims.length === 1 ? "" : "s"} pending on this device.`
    : "No claims are waiting on this device.";
  if (navigator.onLine) status.textContent += " You can reconnect and sign in to upload.";
}

unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const expectedGeneration = generation;
  unlockButton.disabled = true;
  showError("");
  try {
    const envelope = sessionStorage.getItem(offlineContextKey);
    if (!envelope) {
      throw new Error("This tab was not prepared. Reconnect, sign in and prepare offline attendance first.");
    }
    const current = await openOfflineContext(envelope, passphraseInput.value);
    if (generation !== expectedGeneration) return;
    if (!currentSessionMatches(current)) {
      throw new Error("The account session changed. Reconnect and prepare offline attendance again.");
    }
    const requestedVenue = new URL(location.href).searchParams.get("venue");
    if (requestedVenue && requestedVenue.toLowerCase() !== current.venueId.toLowerCase()) {
      throw new Error("This tab was prepared for another venue. Reconnect and prepare the selected venue.");
    }
    context = current;
    selection.replaceChildren();
    for (const option of current.options) {
      const item = document.createElement("option");
      item.value = `${option.employee_id}:${option.department_id}`;
      item.textContent = `${option.employee_name} · ${option.department_name}`;
      selection.append(item);
    }
    passphraseInput.value = "";
    unlockForm.hidden = true;
    capture.hidden = false;
    await showClaims(current, expectedGeneration);
  } catch (error) {
    console.error("Could not unlock offline attendance.", error);
    lockScreen();
    showError(error instanceof Error ? error.message : "Offline attendance could not be opened.");
  } finally {
    unlockButton.disabled = false;
  }
});

async function record(eventType) {
  if (recording || !context) return;
  const current = context;
  if (!requireCurrentSession(current)) return;
  const expectedGeneration = generation;
  const option = current.options.find((item) =>
    `${item.employee_id}:${item.department_id}` === selection.value);
  if (!option) {
    showError("Choose your employee and department before saving a claim.");
    return;
  }
  recording = true;
  clockIn.disabled = true;
  clockOut.disabled = true;
  showError("");
  let saved = false;
  try {
    if (typeof crypto.randomUUID !== "function") throw new Error("Secure request identifiers are unavailable.");
    await saveOfflineClaim({
      requestId: crypto.randomUUID(), actorId: current.actorId, businessId: current.businessId,
      venueId: current.venueId, departmentId: option.department_id, employeeId: option.employee_id,
      eventType, claimedAt: new Date().toISOString(),
    });
    saved = true;
    await showClaims(current, expectedGeneration);
  } catch (error) {
    console.error(saved ? "Could not read pending offline attendance claims." : "Could not save an offline attendance claim.", error);
    if (generation === expectedGeneration) {
      showError(saved
        ? "The claim was saved, but its pending status could not be displayed. Keep this device and contact your manager."
        : "The claim was not saved. Record the time separately and contact your manager.");
    }
  } finally {
    recording = false;
    clockIn.disabled = false;
    clockOut.disabled = false;
  }
}

clockIn.addEventListener("click", () => { void record("clock_in"); });
clockOut.addEventListener("click", () => { void record("clock_out"); });
lockButton.addEventListener("click", () => {
  lockScreen();
  showError("");
});
reconnect.addEventListener("click", () => {
  if (!context) return;
  if (!requireCurrentSession(context)) return;
  if (!navigator.onLine) {
    showError("This device is still offline. Keep the claims here until you can reconnect.");
    return;
  }
  // The standalone offline shell does not have a Next.js router.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  location.assign(`/attendance?${new URLSearchParams({ venue: context.venueId })}`);
});
window.addEventListener("online", () => {
  if (!context || !requireCurrentSession(context)) return;
  const current = context;
  void showClaims(current, generation).catch((error) => {
    console.error("Could not check pending offline attendance claims.", error);
    showError("Pending claims are unavailable. Keep this device and contact your manager.");
  });
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && context) requireCurrentSession(context);
});
window.setInterval(() => {
  if (context) requireCurrentSession(context);
}, 2_000);
window.addEventListener("storage", (event) => {
  if (event.key !== sessionEventKey || !event.newValue) return;
  try {
    sessionStorage.removeItem(offlineContextKey);
  } catch (error) {
    console.error("Could not remove offline preparation after a session change.", error);
  }
  lockScreen();
  showError("The account session changed. Reconnect and prepare offline attendance again.");
});

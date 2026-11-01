const databaseName = "butterbox-offline-attendance";
const storeName = "claims";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const offlineContextKey = "butterbox:offline-attendance-context:v1";
export const sessionEventKey = "butterbox:session-ended";
export const offlineShellCache = "butterbox-offline-shell-v1";
export const offlineShellAssets = [
  "/offline-attendance.html",
  "/offline-attendance.css",
  "/offline-attendance-app.mjs",
  "/offline-attendance-shared.mjs",
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value) {
  return typeof value === "string" && uuid.test(value);
}

export function parseOfflineAttendanceClaim(value) {
  if (!isRecord(value) || !isUuid(value.requestId) || !isUuid(value.actorId) ||
    !isUuid(value.businessId) || !isUuid(value.venueId) || !isUuid(value.departmentId) ||
    !isUuid(value.employeeId) || (value.eventType !== "clock_in" && value.eventType !== "clock_out") ||
    typeof value.claimedAt !== "string" || !Number.isFinite(Date.parse(value.claimedAt))) return null;
  return {
    requestId: value.requestId, actorId: value.actorId, businessId: value.businessId,
    venueId: value.venueId, departmentId: value.departmentId, employeeId: value.employeeId,
    eventType: value.eventType, claimedAt: value.claimedAt,
  };
}

export function parseOfflineContext(value) {
  if (!isRecord(value) || !isUuid(value.actorId) || !isUuid(value.businessId) ||
    !isUuid(value.venueId) || !isUuid(value.sessionId) || typeof value.authCookieName !== "string" ||
    !/^sb-[a-z0-9_-]{1,63}-auth-token$/i.test(value.authCookieName) ||
    !Array.isArray(value.options) || value.options.length < 1 ||
    value.options.length > 1000) return null;
  const options = [];
  const seen = new Set();
  for (const option of value.options) {
    if (!isRecord(option) || !isUuid(option.employee_id) || !isUuid(option.department_id) ||
      typeof option.employee_name !== "string" || !option.employee_name.trim() ||
      typeof option.department_name !== "string" || !option.department_name.trim()) return null;
    const key = `${option.employee_id}:${option.department_id}`.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    options.push({
      employee_id: option.employee_id, employee_name: option.employee_name,
      department_id: option.department_id, department_name: option.department_name,
    });
  }
  return {
    actorId: value.actorId, businessId: value.businessId, venueId: value.venueId,
    sessionId: value.sessionId, authCookieName: value.authCookieName, options,
  };
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch (error) {
    if (error instanceof DOMException || error instanceof TypeError) return null;
    throw error;
  }
}

export function browserSessionIdentity(cookies, cookieName) {
  if (typeof cookies !== "string" || typeof cookieName !== "string" ||
    !/^sb-[a-z0-9_-]{1,63}-auth-token$/i.test(cookieName)) return null;
  const chunks = new Map();
  let unchunked = null;
  for (const part of cookies.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== cookieName && !name.startsWith(`${cookieName}.`)) continue;
    let value;
    try {
      value = decodeURIComponent(part.slice(separator + 1).trim());
    } catch (error) {
      if (error instanceof URIError) return null;
      throw error;
    }
    if (name === cookieName) {
      if (unchunked !== null) return null;
      unchunked = value;
    } else {
      const suffix = name.slice(cookieName.length + 1);
      if (!/^(0|[1-9]\d*)$/.test(suffix) || Number(suffix) > 100 || chunks.has(Number(suffix))) return null;
      chunks.set(Number(suffix), value);
    }
  }
  if ((unchunked !== null && chunks.size) || (unchunked === null && !chunks.size)) return null;
  let raw = unchunked ?? "";
  if (unchunked === null) {
    for (let index = 0; index < chunks.size; index += 1) {
      if (!chunks.has(index)) return null;
      raw += chunks.get(index);
    }
  }
  if (raw.length > 100_000) return null;
  const text = raw.startsWith("base64-") ? decodeBase64Url(raw.slice(7)) : raw;
  if (!text) return null;
  try {
    const session = JSON.parse(text);
    if (!isRecord(session) || typeof session.access_token !== "string") return null;
    const token = session.access_token.split(".");
    if (token.length !== 3) return null;
    const payloadText = decodeBase64Url(token[1]);
    if (!payloadText) return null;
    const payload = JSON.parse(payloadText);
    return isRecord(payload) && isUuid(payload.sub) && isUuid(payload.session_id)
      ? { actorId: payload.sub, sessionId: payload.session_id } : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value, minimum, maximum) {
  if (typeof value !== "string" || value.length > Math.ceil(maximum / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("The offline preparation is invalid.");
  let binary;
  try {
    binary = atob(value);
  } catch (error) {
    if (error instanceof DOMException) throw new Error("The offline preparation is invalid.");
    throw error;
  }
  if (binary.length < minimum || binary.length > maximum) throw new Error("The offline preparation is invalid.");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function passphraseKey(passphrase, salt) {
  if (typeof passphrase !== "string" || passphrase.length < 12 || passphrase.length > 128) {
    throw new Error("Enter an offline passphrase between 12 and 128 characters.");
  }
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase),
    "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function sealOfflineContext(context, passphrase) {
  const validated = parseOfflineContext(context);
  if (!validated) throw new Error("The current attendance scope is invalid.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passphraseKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(validated)),
  );
  return JSON.stringify({ version: 1, salt: toBase64(salt), iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)) });
}

export async function openOfflineContext(envelope, passphrase) {
  if (typeof envelope !== "string" || envelope.length > 1_000_000) {
    throw new Error("The offline preparation is invalid.");
  }
  let parsed;
  try {
    parsed = JSON.parse(envelope);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("The offline preparation is invalid.");
    throw error;
  }
  if (!isRecord(parsed) || parsed.version !== 1) throw new Error("The offline preparation is invalid.");
  const salt = fromBase64(parsed.salt, 16, 16);
  const iv = fromBase64(parsed.iv, 12, 12);
  const ciphertext = fromBase64(parsed.ciphertext, 16, 750_000);
  const key = await passphraseKey(passphrase, salt);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  } catch (error) {
    if (error instanceof DOMException && error.name === "OperationError") {
      throw new Error("The passphrase is incorrect or the offline preparation was changed.");
    }
    throw error;
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      throw new Error("The offline preparation is invalid.");
    }
    throw error;
  }
  const context = parseOfflineContext(value);
  if (!context) throw new Error("The offline preparation is invalid.");
  return context;
}

function openQueue() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Device storage is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    let settled = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: "requestId" });
    };
    request.onblocked = () => {
      settled = true;
      reject(new Error("Device storage is blocked by another tab."));
    };
    request.onerror = () => {
      settled = true;
      reject(request.error ?? new Error("Device storage could not be opened."));
    };
    request.onsuccess = () => {
      if (settled) request.result.close();
      else resolve(request.result);
    };
  });
}

async function queueRequest(mode, operation) {
  const database = await openQueue();
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      transaction.oncomplete = () => {
        database.close();
        resolve(request.result);
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? request.error ?? new Error("Device storage transaction failed."));
      };
    } catch (error) {
      database.close();
      reject(error);
    }
  });
}

export async function saveOfflineClaim(claim) {
  if (!parseOfflineAttendanceClaim(claim)) throw new Error("Invalid offline attendance claim.");
  await queueRequest("readwrite", (store) => store.add(claim));
}

export async function removeOfflineClaim(requestId) {
  await queueRequest("readwrite", (store) => store.delete(requestId));
}

export async function listOfflineClaims(actorId, businessId) {
  const values = await queueRequest("readonly", (store) => store.getAll());
  const claims = [];
  for (const value of values) {
    if (!isRecord(value) || typeof value.actorId !== "string" || typeof value.businessId !== "string") {
      throw new Error("Device storage contains an invalid attendance claim.");
    }
    if (value.actorId !== actorId || value.businessId !== businessId) continue;
    const claim = parseOfflineAttendanceClaim(value);
    if (!claim) throw new Error("Device storage contains an invalid attendance claim.");
    claims.push(claim);
  }
  return claims.sort((a, b) => a.claimedAt.localeCompare(b.claimedAt) ||
    a.requestId.localeCompare(b.requestId));
}

import { parseOfflineAttendanceClaim, type OfflineAttendanceClaim } from "./offline-attendance";

const databaseName = "butterbox-offline-attendance";
const storeName = "claims";

function openQueue(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Device storage is unavailable."));
  }
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

async function queueRequest<T>(
  mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
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

export async function saveOfflineClaim(claim: OfflineAttendanceClaim): Promise<void> {
  if (!parseOfflineAttendanceClaim(claim)) throw new Error("Invalid offline attendance claim.");
  await queueRequest("readwrite", (store) => store.add(claim));
}

export async function removeOfflineClaim(requestId: string): Promise<void> {
  await queueRequest("readwrite", (store) => store.delete(requestId));
}

export async function listOfflineClaims(actorId: string, businessId: string): Promise<OfflineAttendanceClaim[]> {
  const values: unknown[] = await queueRequest("readonly", (store) => store.getAll());
  const claims: OfflineAttendanceClaim[] = [];
  for (const value of values) {
    if (typeof value !== "object" || value === null ||
      !("actorId" in value) || typeof value.actorId !== "string" ||
      !("businessId" in value) || typeof value.businessId !== "string") {
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

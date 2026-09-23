/**
 * Saved sessions, in the browser's own IndexedDB -- nothing here ever
 * leaves the machine, the same as a run itself. One object store, keyed by
 * the execution id; every read and write degrades to a rejected promise
 * rather than throwing synchronously, so a browser with IndexedDB disabled
 * (private browsing in some of them, or a locked-down profile) loses
 * persistence without losing the run in front of the user.
 */

const DB_NAME = "graphbin-viz-sessions";
const DB_VERSION = 1;
const STORE = "sessions";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function putSession(record) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(record);
  await txDone(tx);
  return record;
}

export async function getSession(id) {
  if (!id) return null;
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const result = await reqToPromise(tx.objectStore(STORE).get(id));
  await txDone(tx);
  return result || null;
}

export async function listSessions() {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const all = await reqToPromise(tx.objectStore(STORE).getAll());
  await txDone(tx);
  return all.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function deleteSession(id) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  return txDone(tx);
}

/** Merge a patch into an existing record (a re-run updates its session in place). */
export async function patchSession(id, patch) {
  const existing = await getSession(id);
  if (!existing) return null;
  const merged = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
  await putSession(merged);
  return merged;
}

export async function renameSession(id, name) {
  return patchSession(id, { name });
}

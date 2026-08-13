import type { Entry } from "./types";

const DB_NAME = "tagebuch";
const DB_VERSION = 1;
const STORE = "entries";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB steht hier nicht zur Verfügung."));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function done(request: IDBRequest | IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    if ("oncomplete" in request) {
      request.oncomplete = () => resolve();
      request.onerror = () => reject(request.error);
    } else {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }
  });
}

export async function readAll(): Promise<Entry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").getAll();
    req.onsuccess = () => resolve((req.result as Entry[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function writeEntry(entry: Entry): Promise<void> {
  const db = await openDB();
  await done(tx(db, "readwrite").put(entry));
}

export async function writeMany(entries: Entry[]): Promise<void> {
  if (!entries.length) return;
  const db = await openDB();
  const store = tx(db, "readwrite");
  entries.forEach((e) => store.put(e));
  await done(store.transaction);
}

export async function removeEntry(id: string): Promise<void> {
  const db = await openDB();
  await done(tx(db, "readwrite").delete(id));
}

export async function removeAll(): Promise<void> {
  const db = await openDB();
  await done(tx(db, "readwrite").clear());
}

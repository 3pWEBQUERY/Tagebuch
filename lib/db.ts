import type { Entry } from "./types";

const DB_NAME = "tagebuch";
const DB_VERSION = 2;
const STORE = "entries";
/** Gelöschte ids, bis der Abgleich sie an die Datenbank weitergereicht hat. */
const TOMBSTONES = "tombstones";

let dbPromise: Promise<IDBDatabase> | null = null;

const REQUIRED_STORES = [STORE, TOMBSTONES];

function open(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      // v2: Grabsteine, damit ein Löschen auch auf anderen Geräten ankommt.
      if (!db.objectStoreNames.contains(TOMBSTONES)) {
        db.createObjectStore(TOMBSTONES, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Datenbank ist in einem anderen Tab geöffnet."));
  });
}

function hasAllStores(db: IDBDatabase): boolean {
  return REQUIRED_STORES.every((name) => db.objectStoreNames.contains(name));
}

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB steht hier nicht zur Verfügung."));
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      // Erst den vorhandenen Stand öffnen, statt starr DB_VERSION zu fordern:
      // liegt auf dem Gerät schon eine höhere Version, wäre das ein VersionError
      // und die App sähe für immer ein leeres Tagebuch.
      let db = await open();
      if (db.version < DB_VERSION || !hasAllStores(db)) {
        // Fehlt ein Speicher trotz passender Version, hat das Gerät eine
        // unfertige Zwischenversion erwischt – ein Sprung nach oben repariert
        // das, ohne vorhandene Einträge anzufassen.
        const target = Math.max(DB_VERSION, db.version + (hasAllStores(db) ? 0 : 1));
        db.close();
        db = await open(target);
      }
      return db;
    })().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode, store: string = STORE) {
  return db.transaction(store, mode).objectStore(store);
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

/* ── Grabsteine ──────────────────────────────────────────────
   Ein lokal gelöschter Eintrag muss die Löschung noch weitergeben können.
   Erst wenn der Abgleich sie bestätigt hat, verschwindet der Grabstein. */

export type Tombstone = { id: string; deletedAt: number };

export async function readTombstones(): Promise<Tombstone[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly", TOMBSTONES).getAll();
    req.onsuccess = () => resolve((req.result as Tombstone[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function writeTombstone(stone: Tombstone): Promise<void> {
  const db = await openDB();
  await done(tx(db, "readwrite", TOMBSTONES).put(stone));
}

export async function dropTombstones(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDB();
  const store = tx(db, "readwrite", TOMBSTONES);
  ids.forEach((id) => store.delete(id));
  await done(store.transaction);
}

export async function removeMany(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDB();
  const store = tx(db, "readwrite");
  ids.forEach((id) => store.delete(id));
  await done(store.transaction);
}

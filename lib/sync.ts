"use client";

import * as db from "./db";
import type { Entry } from "./types";

/**
 * Abgleich zwischen dem Gerät und der Postgres-Datenbank.
 *
 * Das Gerät bleibt die führende Kopie: geschrieben wird immer zuerst nach
 * IndexedDB, der Abgleich läuft danach. Deshalb funktioniert die App auch
 * ohne Netz unverändert weiter.
 *
 * Zwei getrennte Marken, weil Gerät und Server verschiedene Uhren haben:
 *   lastPush – lokale Zeit; bestimmt, was noch nicht abgeschickt wurde
 *   lastPull – Serverzeit; bestimmt, was von dort noch fehlt
 * Bei Kollisionen gewinnt die jüngere Fassung (updatedAt).
 */

const PUSH_KEY = "tb:lastPush";
const PULL_KEY = "tb:lastPull";
const TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 Tage

export type SyncOutcome = {
  /** Vom Server übernommene oder aktualisierte Einträge. */
  applied: Entry[];
  /** Anderswo gelöschte ids, die lokal entfernt wurden. */
  removed: string[];
  pushed: number;
  serverTime: number;
};

export class SyncOffline extends Error {
  constructor() {
    super("Keine Verbindung");
    this.name = "SyncOffline";
  }
}

/** Sitzung fehlt oder ist abgelaufen – die Oberfläche muss zur Anmeldung. */
export class SyncLocked extends Error {
  constructor() {
    super("Nicht angemeldet");
    this.name = "SyncLocked";
  }
}

/**
 * Ein Gerät kann nacheinander mehrere Konten sehen. Die lokale Kopie gehört
 * immer genau einem davon – sonst lädt das nächste Konto fremde Einträge hoch.
 */
const USER_KEY = "tb:user";

export function localUserId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(USER_KEY);
}

export async function adoptUser(userId: string): Promise<boolean> {
  const previous = localUserId();
  if (previous === userId) return false;
  // Kontowechsel: alles Lokale gehört der vorigen Person. Es liegt in deren
  // Datenbank, hier muss es weg.
  await db.removeAll();
  await db.dropTombstones((await db.readTombstones()).map((t) => t.id));
  resetSyncMarks();
  localStorage.setItem(USER_KEY, userId);
  return true;
}

/** Beim Abmelden bleibt nichts Lesbares auf dem Gerät zurück. */
export async function clearLocalData(): Promise<void> {
  await db.removeAll();
  await db.dropTombstones((await db.readTombstones()).map((t) => t.id));
  resetSyncMarks();
  localStorage.removeItem(USER_KEY);
}

/** Der Server hat keine Datenbank konfiguriert – automatisches Wiederholen ist zwecklos. */
export class SyncDisabled extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncDisabled";
  }
}

/**
 * Erzwingt, dass beim nächsten Lauf alles erneut hochgeladen wird.
 * Nötig nach einem Import: dessen Einträge tragen alte Zeitstempel und
 * lägen sonst hinter der Push-Marke.
 */
export function forceFullPush(): void {
  localStorage.setItem(PUSH_KEY, "0");
}

function readMark(key: string): number {
  const raw = Number(localStorage.getItem(key));
  return Number.isFinite(raw) ? raw : 0;
}

export function lastSyncedAt(): number | null {
  const value = readMark(PULL_KEY);
  return value > 0 ? value : null;
}

export function resetSyncMarks(): void {
  localStorage.removeItem(PUSH_KEY);
  localStorage.removeItem(PULL_KEY);
}

/** Gibt es Änderungen, die noch nicht in der Datenbank stehen? */
export async function hasPendingChanges(local: Entry[]): Promise<boolean> {
  const lastPush = readMark(PUSH_KEY);
  if (local.some((e) => e.updatedAt > lastPush)) return true;
  const tombstones = await db.readTombstones();
  return tombstones.some((t) => t.deletedAt > lastPush);
}

/** Merkt eine lokale Löschung vor, damit der Abgleich sie weitergeben kann. */
export async function recordDeletion(id: string): Promise<void> {
  await db.writeTombstone({ id, deletedAt: Date.now() });
}

export async function syncEntries(local: Entry[]): Promise<SyncOutcome> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new SyncOffline();

  const lastPush = readMark(PUSH_KEY);
  const lastPull = readMark(PULL_KEY);
  // Vor dem Request stempeln: was währenddessen geschrieben wird, geht beim
  // nächsten Lauf mit, statt still verloren zu gehen.
  const pushMark = Date.now();

  const tombstones = await db.readTombstones();
  const changed = local.filter((e) => e.updatedAt > lastPush);
  const deletions = tombstones.filter((t) => t.deletedAt > lastPush);

  let response: Response;
  try {
    response = await fetch("/api/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ since: lastPull, entries: changed, deletions }),
    });
  } catch {
    throw new SyncOffline();
  }

  if (!response.ok) {
    const detail = await response
      .json()
      .then((d: { error?: string }) => d.error)
      .catch(() => undefined);
    if (response.status === 401) throw new SyncLocked();
    if (response.status === 503) throw new SyncDisabled(detail ?? "Keine Datenbank verbunden");
    throw new Error(detail ?? `Abgleich fehlgeschlagen (${response.status})`);
  }

  const data = (await response.json()) as {
    serverTime: number;
    entries: Entry[];
    deletions: { id: string; deletedAt: number }[];
  };

  const byId = new Map(local.map((e) => [e.id, e]));
  const applied: Entry[] = [];
  for (const remote of data.entries) {
    const mine = byId.get(remote.id);
    if (!mine || remote.updatedAt > mine.updatedAt) applied.push(remote);
  }
  const removed = data.deletions
    .filter(({ id, deletedAt }) => {
      const mine = byId.get(id);
      return mine ? mine.updatedAt <= deletedAt : false;
    })
    .map(({ id }) => id);

  if (applied.length) await db.writeMany(applied);
  if (removed.length) await db.removeMany(removed);

  // Bestätigte Grabsteine abräumen, alte Reste ebenfalls.
  const settled = deletions.map((t) => t.id);
  const stale = tombstones.filter((t) => Date.now() - t.deletedAt > TOMBSTONE_TTL).map((t) => t.id);
  await db.dropTombstones([...new Set([...settled, ...stale])]);

  localStorage.setItem(PUSH_KEY, String(pushMark));
  localStorage.setItem(PULL_KEY, String(data.serverTime));

  return { applied, removed, pushed: changed.length + deletions.length, serverTime: data.serverTime };
}

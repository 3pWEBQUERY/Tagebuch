"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as db from "./db";
import {
  deleteAccount as deleteAccountRequest,
  logout as endSession,
  readSession,
  type SessionUser,
} from "./auth";
import {
  adoptUser,
  clearLocalData,
  forceFullPush,
  hasPendingChanges,
  lastSyncedAt,
  recordDeletion,
  SyncDisabled,
  SyncLocked,
  SyncOffline,
  syncEntries,
} from "./sync";
import { ACCENTS, type Entry, type Profile, type ThemePref } from "./types";

const THEME_KEY = "tb:theme";
const ACCENT_KEY = "tb:accent";

export type Toast = {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
};

export type SyncStatus = "idle" | "syncing" | "offline" | "error" | "disabled" | "locked";

export type SyncState = {
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
};

export type Session = {
  user: SessionUser | null;
  profile: Profile | null;
  signupCodeRequired: boolean;
  checked: boolean;
};

type Store = {
  entries: Entry[];
  loaded: boolean;
  sync: SyncState;
  syncNow: () => Promise<void>;
  session: Session;
  setProfile: (profile: Profile) => void;
  signIn: (user: SessionUser, profile: Profile | null) => Promise<void>;
  signOut: (options?: { force?: boolean }) => Promise<"ok" | "unsynced">;
  deleteAccount: () => Promise<void>;
  save: (entry: Entry) => Promise<void>;
  remove: (id: string, options?: { undo?: boolean }) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  importMany: (list: Entry[]) => Promise<number>;
  wipe: () => Promise<void>;

  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  accent: string;
  setAccent: (hex: string) => void;

  toasts: Toast[];
  toast: (text: string, action?: Toast["action"]) => void;
  dismissToast: (id: number) => void;
};

const StoreContext = createContext<Store | null>(null);

const byNewest = (a: Entry, b: Entry) => b.createdAt - a.createdAt;

function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0a0c11" : "#e9ecf4");
}

function readTheme(): ThemePref {
  if (typeof localStorage === "undefined") return "system";
  const t = localStorage.getItem(THEME_KEY);
  return t === "light" || t === "dark" || t === "system" ? t : "system";
}

function readAccent(): string {
  if (typeof localStorage === "undefined") return ACCENTS[0].hex;
  return localStorage.getItem(ACCENT_KEY) ?? ACCENTS[0].hex;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [theme, setThemeState] = useState<ThemePref>(readTheme);
  const [accent, setAccentState] = useState<string>(readAccent);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sync, setSync] = useState<SyncState>({ status: "idle", lastSyncedAt: null, error: null });
  const [session, setSession] = useState<Session>({
    user: null,
    profile: null,
    signupCodeRequired: false,
    checked: false,
  });
  const toastId = useRef(0);
  /** Immer der aktuelle Stand – der Abgleich läuft außerhalb des Renderzyklus. */
  const entriesRef = useRef<Entry[]>(entries);
  const syncing = useRef(false);
  const syncTimer = useRef<number | null>(null);

  entriesRef.current = entries;

  /* Einträge einmalig aus IndexedDB laden */
  useEffect(() => {
    let alive = true;
    db.readAll()
      .then((list) => {
        if (alive) setEntries(list.sort(byNewest));
      })
      .catch((err: unknown) => {
        // Kein stilles Verschlucken: ohne Meldung sieht ein Lesefehler aus
        // wie ein leeres Tagebuch.
        console.error("[tagebuch] Einträge konnten nicht geladen werden:", err);
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  /* Wer ist angemeldet? Wechselt das Konto, muss die lokale Kopie weg,
     bevor irgendetwas hochgeladen wird. */
  useEffect(() => {
    readSession()
      .then(async (state) => {
        if (state.user) {
          const switched = await adoptUser(state.user.id);
          if (switched) setEntries([]);
        }
        setSession({ ...state, checked: true });
      })
      .catch(() => setSession((s) => ({ ...s, checked: true })));
  }, []);

  /* ── Abgleich mit der Datenbank ───────────────────────────
     Läuft immer nach dem lokalen Schreiben; scheitert er, bleibt der
     Eintrag trotzdem auf dem Gerät und geht beim nächsten Lauf mit. */
  const runSync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    setSync((s) => ({ ...s, status: "syncing" }));
    try {
      const { applied, removed } = await syncEntries(entriesRef.current);
      if (applied.length || removed.length) {
        setEntries((list) => {
          const map = new Map(list.map((e) => [e.id, e]));
          applied.forEach((e) => map.set(e.id, e));
          removed.forEach((id) => map.delete(id));
          return [...map.values()].sort(byNewest);
        });
      }
      setSync({ status: "idle", lastSyncedAt: lastSyncedAt(), error: null });
    } catch (err) {
      if (err instanceof SyncOffline) {
        setSync((s) => ({ ...s, status: "offline", error: null }));
      } else if (err instanceof SyncLocked) {
        setSession((s) => ({ ...s, user: null, checked: true }));
        setSync((s) => ({ ...s, status: "locked", error: null }));
      } else if (err instanceof SyncDisabled) {
        setSync((s) => ({ ...s, status: "disabled", error: err.message }));
      } else {
        setSync((s) => ({
          ...s,
          status: "error",
          error: err instanceof Error ? err.message : "Abgleich fehlgeschlagen",
        }));
      }
    } finally {
      syncing.current = false;
    }
  }, []);

  const setProfile = useCallback((profile: Profile) => {
    setSession((s) => ({ ...s, profile }));
  }, []);

  const signIn = useCallback(
    async (user: SessionUser, profile: Profile | null) => {
      // Frisch angemeldet: gehört die lokale Kopie jemand anderem, fliegt sie raus.
      const switched = await adoptUser(user.id);
      if (switched) setEntries([]);
      setSession((s) => ({ ...s, user, profile, checked: true }));
      void runSync();
    },
    [runSync],
  );

  const signOut = useCallback(
    async (options?: { force?: boolean }) => {
      // Abmelden räumt das Gerät leer. Was hier noch nicht hochgeladen ist,
      // wäre danach weg – deshalb erst ein letzter Abgleich und, wenn der
      // scheitert, eine ehrliche Rückfrage statt stiller Löschung.
      await runSync().catch(() => undefined);
      if (!options?.force && (await hasPendingChanges(entriesRef.current))) {
        return "unsynced";
      }
      await endSession();
      await clearLocalData();
      setEntries([]);
      setSession((s) => ({ ...s, user: null, checked: true }));
      setSync({ status: "locked", lastSyncedAt: null, error: null });
      return "ok";
    },
    [runSync],
  );

  const deleteAccount = useCallback(async () => {
    await deleteAccountRequest();
    await clearLocalData();
    setEntries([]);
    setSession((s) => ({ ...s, user: null, checked: true }));
    setSync({ status: "locked", lastSyncedAt: null, error: null });
  }, []);

  /** Nach Änderungen kurz warten – Tippen soll nicht jeden Anschlag hochladen. */
  const scheduleSync = useCallback(() => {
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => void runSync(), 1500);
  }, [runSync]);

  useEffect(() => {
    if (!loaded) return;
    void runSync();
    const onOnline = () => void runSync();
    const onVisible = () => {
      if (document.visibilityState === "visible") void runSync();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    };
  }, [loaded, runSync]);

  /* Theme anwenden + Systemwechsel verfolgen */
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
  }, [accent]);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
  }, []);

  const setAccent = useCallback((hex: string) => {
    setAccentState(hex);
    localStorage.setItem(ACCENT_KEY, hex);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (text: string, action?: Toast["action"]) => {
      const id = ++toastId.current;
      setToasts((list) => [...list.slice(-2), { id, text, action }]);
      setTimeout(() => dismissToast(id), action ? 6000 : 3200);
    },
    [dismissToast],
  );

  const save = useCallback(
    async (entry: Entry) => {
      setEntries((list) => {
        const i = list.findIndex((e) => e.id === entry.id);
        const next = i === -1 ? [entry, ...list] : list.map((e) => (e.id === entry.id ? entry : e));
        return next.sort(byNewest);
      });
      await db.writeEntry(entry);
      scheduleSync();
    },
    [scheduleSync],
  );

  const remove = useCallback(
    async (id: string, options?: { undo?: boolean }) => {
      const victim = entries.find((e) => e.id === id);
      setEntries((list) => list.filter((e) => e.id !== id));
      await db.removeEntry(id);
      await recordDeletion(id);
      scheduleSync();
      if (options?.undo && victim) {
        toast("Eintrag gelöscht", {
          label: "Rückgängig",
          run: () => {
            // Wiederherstellen heißt: jünger als der Grabstein sein, sonst
            // löscht der nächste Abgleich den Eintrag gleich wieder weg.
            const revived = { ...victim, updatedAt: Date.now() };
            setEntries((list) => [revived, ...list].sort(byNewest));
            void db.writeEntry(revived).then(() => db.dropTombstones([id]).then(scheduleSync));
          },
        });
      }
    },
    [entries, toast, scheduleSync],
  );

  const toggleFavorite = useCallback(
    async (id: string) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      await save({ ...entry, favorite: !entry.favorite, updatedAt: Date.now() });
    },
    [entries, save],
  );

  const importMany = useCallback(
    async (list: Entry[]) => {
      if (!list.length) return 0;
      await db.writeMany(list);
      setEntries((current) => {
        const map = new Map(current.map((e) => [e.id, e]));
        list.forEach((e) => map.set(e.id, e));
        return [...map.values()].sort(byNewest);
      });
      // Importierte Einträge tragen alte Zeitstempel und lägen sonst hinter
      // der Push-Marke – einmal alles neu hochladen.
      forceFullPush();
      scheduleSync();
      return list.length;
    },
    [scheduleSync],
  );

  const wipe = useCallback(async () => {
    // Ohne Grabsteine holt der nächste Abgleich alles aus der Datenbank zurück.
    const now = Date.now();
    await Promise.all(entriesRef.current.map((e) => db.writeTombstone({ id: e.id, deletedAt: now })));
    await db.removeAll();
    setEntries([]);
    scheduleSync();
  }, [scheduleSync]);

  const value = useMemo<Store>(
    () => ({
      entries,
      loaded,
      sync,
      syncNow: runSync,
      session,
      setProfile,
      signIn,
      signOut,
      deleteAccount,
      save,
      remove,
      toggleFavorite,
      importMany,
      wipe,
      theme,
      setTheme,
      accent,
      setAccent,
      toasts,
      toast,
      dismissToast,
    }),
    [
      entries,
      loaded,
      sync,
      runSync,
      session,
      setProfile,
      signIn,
      signOut,
      deleteAccount,
      save,
      remove,
      toggleFavorite,
      importMany,
      wipe,
      theme,
      setTheme,
      accent,
      setAccent,
      toasts,
      toast,
      dismissToast,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore muss innerhalb von <StoreProvider> verwendet werden.");
  return ctx;
}

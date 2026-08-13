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
import { ACCENTS, type Entry, type ThemePref } from "./types";

const THEME_KEY = "tb:theme";
const ACCENT_KEY = "tb:accent";

export type Toast = {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
};

type Store = {
  entries: Entry[];
  loaded: boolean;
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
  const toastId = useRef(0);

  /* Einträge einmalig aus IndexedDB laden */
  useEffect(() => {
    let alive = true;
    db.readAll()
      .then((list) => {
        if (alive) setEntries(list.sort(byNewest));
      })
      .catch(() => {
        /* Speicher nicht verfügbar (z. B. privater Modus) – App bleibt bedienbar. */
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

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

  const save = useCallback(async (entry: Entry) => {
    setEntries((list) => {
      const i = list.findIndex((e) => e.id === entry.id);
      const next = i === -1 ? [entry, ...list] : list.map((e) => (e.id === entry.id ? entry : e));
      return next.sort(byNewest);
    });
    await db.writeEntry(entry);
  }, []);

  const remove = useCallback(
    async (id: string, options?: { undo?: boolean }) => {
      const victim = entries.find((e) => e.id === id);
      setEntries((list) => list.filter((e) => e.id !== id));
      await db.removeEntry(id);
      if (options?.undo && victim) {
        toast("Eintrag gelöscht", {
          label: "Rückgängig",
          run: () => {
            setEntries((list) => [victim, ...list].sort(byNewest));
            void db.writeEntry(victim);
          },
        });
      }
    },
    [entries, toast],
  );

  const toggleFavorite = useCallback(
    async (id: string) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      await save({ ...entry, favorite: !entry.favorite, updatedAt: Date.now() });
    },
    [entries, save],
  );

  const importMany = useCallback(async (list: Entry[]) => {
    if (!list.length) return 0;
    await db.writeMany(list);
    setEntries((current) => {
      const map = new Map(current.map((e) => [e.id, e]));
      list.forEach((e) => map.set(e.id, e));
      return [...map.values()].sort(byNewest);
    });
    return list.length;
  }, []);

  const wipe = useCallback(async () => {
    await db.removeAll();
    setEntries([]);
  }, []);

  const value = useMemo<Store>(
    () => ({
      entries,
      loaded,
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

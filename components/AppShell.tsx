"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScrolledPast } from "@/lib/client-value";
import { useInstallPrompt } from "@/lib/install";
import { useStore } from "@/lib/store";
import type { Entry } from "@/lib/types";
import { EditorSheet } from "./EditorSheet";
import { IconPlus } from "./icons";
import { InsightsView } from "./InsightsView";
import { JournalView, type Filter } from "./JournalView";
import { SettingsView } from "./SettingsView";
import { TabBar, type ViewId } from "./TabBar";
import { Toasts } from "./Toasts";

const TITLES: Record<ViewId, string> = {
  journal: "Tagebuch",
  insights: "Verlauf",
  settings: "Einstellungen",
};

function createEntry(): Entry {
  const now = Date.now();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${now}-${Math.random().toString(36).slice(2, 10)}`;
  return { id, createdAt: now, updatedAt: now, title: "", body: "", mood: null, tags: [], favorite: false };
}

export function AppShell() {
  const { toast } = useStore();
  const install = useInstallPrompt();

  const [view, setViewState] = useState<ViewId>("journal");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<{ entry: Entry; isNew: boolean } | null>(null);

  /* Kompakte Titelleiste, sobald der große Titel weggescrollt ist */
  const scrolled = useScrolledPast(44);

  const searchRef = useRef<HTMLInputElement>(null);
  const scrollMemory = useRef<Record<ViewId, number>>({ journal: 0, insights: 0, settings: 0 });

  const setView = useCallback(
    (next: ViewId) => {
      if (next === view) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      scrollMemory.current[view] = window.scrollY;
      const swap = () => {
        setViewState(next);
        requestAnimationFrame(() => window.scrollTo({ top: scrollMemory.current[next] ?? 0 }));
      };
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce && "startViewTransition" in document) {
        document.startViewTransition(swap);
      } else {
        swap();
      }
    },
    [view],
  );

  const openNew = useCallback(() => setEditing({ entry: createEntry(), isNew: true }), []);
  const openEntry = useCallback((entry: Entry) => setEditing({ entry, isNew: false }), []);

  /* App-Shortcut „Neuer Eintrag“ aus dem Manifest.
     Bewusst nach dem Mount: eine URL-Auswertung schon im Initialstate würde
     bei statischem Prerender zu einer Hydrations-Abweichung führen. */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openNew();
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [openNew]);

  /* Tastaturkürzel für die Desktop-Nutzung */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (editing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" && !typing) {
        e.preventDefault();
        openNew();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setView("journal");
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, openNew, setView]);

  /* Service Worker: offline-fähig + Hinweis auf neue Version */
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              toast("Neue Version verfügbar", {
                label: "Neu laden",
                run: () => worker.postMessage({ type: "SKIP_WAITING" }),
              });
            }
          });
        });
      })
      .catch(() => {
        /* ohne SW läuft die App weiterhin, nur nicht offline */
      });
  }, [toast]);

  return (
    <>
      <div className="backdrop" aria-hidden="true">
        <span className="blob blob1" />
        <span className="blob blob2" />
        <span className="blob blob3" />
        <span className="grain" />
      </div>

      <a className="skip-link" href="#main">
        Zum Inhalt springen
      </a>

      <header className={`topbar${scrolled ? " topbarSolid" : ""}`}>
        <div className="topbarInner">
          <span className="topbarSpacer" aria-hidden="true" />
          <h2 className="topbarTitle">{TITLES[view]}</h2>
          <button
            className="iconBtn topbarAction"
            type="button"
            aria-label="Neuer Eintrag"
            title="Neuer Eintrag (N)"
            onClick={openNew}
          >
            <IconPlus />
          </button>
        </div>
      </header>

      <main id="main">
        {view === "journal" && (
          <JournalView
            query={query}
            onQuery={setQuery}
            filter={filter}
            onFilter={setFilter}
            onOpen={openEntry}
            onNew={openNew}
            searchRef={searchRef}
          />
        )}
        {view === "insights" && <InsightsView />}
        {view === "settings" && <SettingsView install={install} />}
      </main>

      <TabBar view={view} onView={setView} />

      <button
        className="compose glass"
        type="button"
        aria-label="Neuer Eintrag"
        title="Neuer Eintrag (N)"
        onClick={openNew}
      >
        <IconPlus />
      </button>

      {editing && (
        <EditorSheet
          key={editing.entry.id}
          entry={editing.entry}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
        />
      )}

      <Toasts />
    </>
  );
}

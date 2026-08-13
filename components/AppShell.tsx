"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScrolledPast } from "@/lib/client-value";
import { useInstallPrompt } from "@/lib/install";
import * as social from "@/lib/social";
import { useStore } from "@/lib/store";
import type { Entry, FeedItem } from "@/lib/types";
import { AuthScreen } from "./AuthScreen";
import { EditorSheet } from "./EditorSheet";
import { FeedView } from "./FeedView";
import { IconBell, IconPlus } from "./icons";
import { InsightsView } from "./InsightsView";
import { JournalView, type Filter } from "./JournalView";
import { NotificationsSheet } from "./NotificationsSheet";
import { PostSheet } from "./PostSheet";
import { ReportDialog, type ReportTarget } from "./ReportDialog";
import { ProfileView } from "./ProfileView";
import { SettingsView } from "./SettingsView";
import { TabBar, type ViewId } from "./TabBar";
import { Toasts } from "./Toasts";

const TITLES: Record<ViewId | "settings", string> = {
  journal: "Tagebuch",
  feed: "Feed",
  insights: "Verlauf",
  profile: "Profil",
  settings: "Einstellungen",
};

type Screen = ViewId | "settings";

function createEntry(): Entry {
  const now = Date.now();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${now}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    createdAt: now,
    updatedAt: now,
    title: "",
    body: "",
    mood: null,
    tags: [],
    favorite: false,
    photoId: null,
    // Privat ist der Ausgangspunkt – veröffentlicht wird nur auf Ansage.
    visibility: "private",
    publishedAt: null,
  };
}

export function AppShell() {
  const { toast, session, signIn } = useStore();
  const install = useInstallPrompt();

  const [screen, setScreen] = useState<Screen>("journal");
  const [profileHandle, setProfileHandle] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<Screen | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<{ entry: Entry; isNew: boolean } | null>(null);
  const [post, setPost] = useState<FeedItem | null>(null);
  const [socialVersion, setSocialVersion] = useState(0);
  const [menuItem, setMenuItem] = useState<FeedItem | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [unread, setUnread] = useState(0);

  const scrolled = useScrolledPast(44);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollMemory = useRef<Partial<Record<Screen, number>>>({});

  const go = useCallback(
    (next: Screen, options?: { handle?: string | null; back?: Screen }) => {
      if (next === screen && !options) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      scrollMemory.current[screen] = window.scrollY;
      const swap = () => {
        setScreen(next);
        setProfileHandle(options?.handle ?? null);
        setReturnTo(options?.back ?? null);
        requestAnimationFrame(() =>
          window.scrollTo({ top: options ? 0 : (scrollMemory.current[next] ?? 0) }),
        );
      };
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce && "startViewTransition" in document) {
        // Ein schneller zweiter Wechsel bricht den ersten ab – dessen Promise
        // muss aufgefangen werden, sonst landet der Abbruch als unbehandelter
        // Fehler in der Konsole.
        const transition = document.startViewTransition(swap);
        transition.ready.catch(() => undefined);
        transition.finished.catch(() => undefined);
      } else {
        swap();
      }
    },
    [screen],
  );

  const openProfile = useCallback(
    (handle: string) => {
      const own = session.profile?.handle;
      go("profile", { handle: handle === own ? null : handle, back: screen });
    },
    [go, screen, session.profile?.handle],
  );

  const openNew = useCallback(() => setEditing({ entry: createEntry(), isNew: true }), []);
  const openEntry = useCallback((entry: Entry) => setEditing({ entry, isNew: false }), []);

  /* App-Shortcut „Neuer Eintrag“ aus dem Manifest. */
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
      if (editing || post || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" && !typing) {
        e.preventDefault();
        openNew();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        go("journal");
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, post, openNew, go]);

  /* Ungelesenes zählen – beim Start, bei Rückkehr zum Tab und im Ruhetakt.
     Ein Push-Dienst bräuchte eigene Schlüssel und die Erlaubnis des Geräts;
     das ist ein eigener Schritt, kein Nebenprodukt. */
  useEffect(() => {
    if (!session.user) return;
    let alive = true;
    const check = () => {
      social
        .fetchNotifications()
        .then(({ unread: count }) => {
          if (alive) setUnread(count);
        })
        .catch(() => undefined);
    };
    check();
    const timer = window.setInterval(check, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session.user, socialVersion]);

  async function blockFromMenu(item: FeedItem) {
    setMenuItem(null);
    try {
      await social.setBlock(item.author.handle, true);
      toast(`@${item.author.handle} ist blockiert`);
      setSocialVersion((v) => v + 1);
    } catch {
      toast("Blockieren hat nicht geklappt");
    }
  }

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

  if (session.checked && !session.user) {
    return (
      <>
        <div className="backdrop" aria-hidden="true">
          <span className="blob blob1" />
          <span className="blob blob2" />
          <span className="blob blob3" />
          <span className="grain" />
        </div>
        <AuthScreen
          signupCodeRequired={session.signupCodeRequired}
          onSignedIn={({ user, profile }) => {
            setScreen("journal");
            setProfileHandle(null);
            setQuery("");
            setFilter("all");
            void signIn(user, profile);
          }}
        />
      </>
    );
  }

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
          <h2 className="topbarTitle">{TITLES[screen]}</h2>
          <button
            className="iconBtn topbarAction"
            type="button"
            aria-label="Neuer Eintrag"
            title="Neuer Eintrag (N)"
            onClick={openNew}
          >
            <IconPlus />
          </button>
          <button
            className="iconBtn topbarBell"
            type="button"
            aria-label={unread > 0 ? `Benachrichtigungen (${unread} neu)` : "Benachrichtigungen"}
            onClick={() => setShowNotes(true)}
          >
            <IconBell />
            {unread > 0 && (
              <span className="bellDot" aria-hidden="true">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </div>
      </header>

      <main id="main">
        {screen === "journal" && (
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
        {screen === "feed" && (
          <FeedView
            onOpenPost={setPost}
            onOpenProfile={openProfile}
            onMenu={setMenuItem}
            refreshToken={socialVersion}
          />
        )}
        {screen === "insights" && <InsightsView />}
        {screen === "profile" && (
          <ProfileView
            handle={profileHandle}
            onBack={returnTo ? () => go(returnTo) : null}
            onOpenPost={setPost}
            onOpenProfile={openProfile}
            onOpenSettings={() => go("settings", { back: "profile" })}
            onMenu={setMenuItem}
            onReport={(handle) => setReport({ handle, label: `@${handle}` })}
            refreshToken={socialVersion}
          />
        )}
        {screen === "settings" && (
          <SettingsView install={install} onBack={() => go(returnTo ?? "profile")} />
        )}
      </main>

      {/* Tableiste und Schreiben-Knopf teilen sich eine Zeile – so können sie
          sich auf schmalen Geräten nicht überlagern. */}
      <div className="dock">
        <TabBar
          view={screen === "settings" ? "profile" : screen}
          onView={(v) => go(v)}
          profileHandle={session.profile?.handle ?? ""}
          profileName={session.profile?.displayName ?? ""}
        />
        <button
          className="compose glass"
          type="button"
          aria-label="Neuer Eintrag"
          title="Neuer Eintrag (N)"
          onClick={openNew}
        >
          <IconPlus />
        </button>
      </div>

      {editing && (
        <EditorSheet
          key={editing.entry.id}
          entry={editing.entry}
          isNew={editing.isNew}
          onClose={(published) => {
            setEditing(null);
            // Wurde etwas veröffentlicht, ist der Feed veraltet.
            if (published) setSocialVersion((v) => v + 1);
          }}
        />
      )}

      {post && (
        <PostSheet
          key={post.id}
          item={post}
          onClose={() => setPost(null)}
          onOpenProfile={openProfile}
          onChanged={setPost}
        />
      )}

      {menuItem && (
        <div
          className="actionSheet"
          role="dialog"
          aria-label="Beitragsoptionen"
          onClick={(e) => {
            if (e.currentTarget === e.target) setMenuItem(null);
          }}
        >
          <div className="actionCard glass">
            <p className="actionTitle">Beitrag von @{menuItem.author.handle}</p>
            <button
              className="actionRow"
              type="button"
              onClick={() => {
                setReport({
                  entryId: menuItem.id,
                  handle: menuItem.author.handle,
                  label: "diesen Beitrag",
                });
                setMenuItem(null);
              }}
            >
              Beitrag melden
            </button>
            <button
              className="actionRow actionRowDanger"
              type="button"
              onClick={() => void blockFromMenu(menuItem)}
            >
              @{menuItem.author.handle} blockieren
            </button>
            <button className="actionRow actionCancel" type="button" onClick={() => setMenuItem(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {report && (
        <ReportDialog target={report} onClose={() => setReport(null)} onDone={(m) => toast(m)} />
      )}

      {showNotes && (
        <NotificationsSheet
          onClose={() => setShowNotes(false)}
          onOpenProfile={openProfile}
          onRead={() => setUnread(0)}
        />
      )}

      <Toasts />
    </>
  );
}

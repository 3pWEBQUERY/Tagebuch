"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as social from "@/lib/social";
import type { FeedItem, Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { IconCompass, IconUsers } from "./icons";
import { PostCard } from "./PostCard";

type Scope = social.FeedScope;

export function FeedView({
  onOpenPost,
  onOpenProfile,
  onMenu,
  refreshToken,
}: {
  onOpenPost: (item: FeedItem) => void;
  onOpenProfile: (handle: string) => void;
  onMenu: (item: FeedItem) => void;
  /** Ändert sich, wenn anderswo etwas veröffentlicht wurde – dann neu laden. */
  refreshToken: number;
}) {
  const [scope, setScope] = useState<Scope>("following");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  /* Zählt Anfragen mit: eine überholte Antwort darf den Feed nicht überschreiben. */
  const requestId = useRef(0);

  const load = useCallback(
    async (target: Scope, before?: number | null) => {
      const id = ++requestId.current;
      try {
        const { items: batch } = await social.fetchFeed(target, before);
        if (id !== requestId.current) return;
        setItems((current) => (before ? [...current, ...batch] : batch));
        setMore(batch.length === 20);
        setState("ready");
        setError(null);
      } catch (err) {
        if (id !== requestId.current) return;
        setState("error");
        setError(err instanceof Error ? err.message : "Feed nicht erreichbar");
      }
    },
    [],
  );

  useEffect(() => {
    const id = ++requestId.current;
    let alive = true;
    social
      .fetchFeed(scope)
      .then(async ({ items: batch }) => {
        if (!alive || id !== requestId.current) return;
        setItems(batch);
        setMore(batch.length === 20);
        setState("ready");
        setError(null);
        // Im leeren „Folge ich“-Feed helfen Vorschläge mehr als ein leeres Blatt.
        if (scope === "following" && batch.length === 0) {
          const { profiles } = await social.fetchPeople();
          if (alive && id === requestId.current) setPeople(profiles);
        }
      })
      .catch((err: unknown) => {
        if (!alive || id !== requestId.current) return;
        setState("error");
        setError(err instanceof Error ? err.message : "Feed nicht erreichbar");
      });
    return () => {
      alive = false;
    };
  }, [scope, refreshToken]);

  /* Der Wechsel setzt den Ladezustand – im Effekt wäre das eine Kaskade. */
  function switchScope(next: Scope) {
    if (next === scope) return;
    setScope(next);
    setItems([]);
    setPeople([]);
    setState("loading");
  }

  const toggleLike = useCallback(async (item: FeedItem) => {
    const next = !item.liked;
    // Sofort umschalten – ein Herz, das erst nach dem Netz reagiert, fühlt sich kaputt an.
    setItems((current) =>
      current.map((i) =>
        i.id === item.id ? { ...i, liked: next, likeCount: i.likeCount + (next ? 1 : -1) } : i,
      ),
    );
    try {
      const result = await social.setLike(item.id, next);
      setItems((current) =>
        current.map((i) => (i.id === item.id ? { ...i, ...result } : i)),
      );
    } catch {
      setItems((current) =>
        current.map((i) =>
          i.id === item.id ? { ...i, liked: item.liked, likeCount: item.likeCount } : i,
        ),
      );
    }
  }, []);

  async function follow(profile: Profile) {
    try {
      const { profile: updated } = await social.setFollow(profile.handle, true);
      setPeople((current) => current.map((p) => (p.id === updated.id ? updated : p)));
      void load("following");
    } catch {
      /* Fehler bleibt sichtbar über den unveränderten Knopf */
    }
  }

  return (
    <section className="view" id="view-feed" aria-labelledby="feed-heading">
      <div className="wrap">
        <div className="hero">
          <p className="heroKicker">Gemeinsam</p>
          <h1 className="heroTitle" id="feed-heading">
            Feed
          </h1>
          <p className="heroSub">Was andere von sich zeigen – und was du geteilt hast.</p>
        </div>

        <div className="segmented feedTabs" role="tablist" aria-label="Feed wählen">
          <button
            type="button"
            role="tab"
            aria-selected={scope === "following"}
            onClick={() => switchScope("following")}
          >
            <IconUsers />
            Folge ich
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === "discover"}
            onClick={() => switchScope("discover")}
          >
            <IconCompass />
            Entdecken
          </button>
          <span
            className="segmentedThumb"
            aria-hidden="true"
            style={{
              width: "calc((100% - 6px) / 2)",
              transform: `translateX(${scope === "following" ? 0 : 100}%)`,
            }}
          />
        </div>

        {state === "loading" && (
          <div className="list" aria-hidden="true">
            <div className="skeleton skeletonPost" />
            <div className="skeleton skeletonPost" />
          </div>
        )}

        {state === "error" && (
          <div className="empty">
            <h2 className="emptyTitle">Feed nicht erreichbar</h2>
            <p className="emptyText">{error}</p>
            <button className="btn" type="button" onClick={() => void load(scope)}>
              Nochmal versuchen
            </button>
          </div>
        )}

        {state === "ready" && items.length > 0 && (
          <>
            <div className="posts">
              {items.map((item) => (
                <PostCard
                  key={item.id}
                  item={item}
                  onOpen={onOpenPost}
                  onAuthor={onOpenProfile}
                  onLike={(i) => void toggleLike(i)}
                  onMenu={onMenu}
                />
              ))}
            </div>
            {more && (
              <button
                className="btn btnFull loadMore"
                type="button"
                onClick={() => void load(scope, items[items.length - 1]?.publishedAt)}
              >
                Mehr laden
              </button>
            )}
          </>
        )}

        {state === "ready" && items.length === 0 && scope === "following" && (
          <div className="emptyFeed">
            <h2 className="emptyTitle">Hier ist es noch still</h2>
            <p className="emptyText">
              Folge ein paar Menschen – oder teile selbst einen Eintrag, indem du ihn beim
              Schreiben auf „Öffentlich“ stellst.
            </p>
            {people.length > 0 && (
              <div className="people">
                <h3 className="peopleTitle">Vorschläge</h3>
                {people.map((profile) => (
                  <div className="personRow glass" key={profile.id}>
                    <button
                      className="person"
                      type="button"
                      onClick={() => onOpenProfile(profile.handle)}
                    >
                      <Avatar handle={profile.handle} name={profile.displayName} size={42} />
                      <span className="personText">
                        <span className="personName">{profile.displayName}</span>
                        <span className="personMeta">
                          @{profile.handle} · {profile.entryCount}{" "}
                          {profile.entryCount === 1 ? "Beitrag" : "Beiträge"}
                        </span>
                      </span>
                    </button>
                    <button
                      className={`btn ${profile.following ? "" : "btnPrimary"}`}
                      type="button"
                      onClick={() => void follow(profile)}
                      disabled={profile.following}
                    >
                      {profile.following ? "Folgst du" : "Folgen"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {state === "ready" && items.length === 0 && scope === "discover" && (
          <div className="empty">
            <h2 className="emptyTitle">Noch nichts Öffentliches</h2>
            <p className="emptyText">
              Bisher hat niemand einen Eintrag veröffentlicht. Du könntest die erste Person sein.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

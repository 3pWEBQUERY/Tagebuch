"use client";

import { useCallback, useEffect, useState } from "react";
import * as social from "@/lib/social";
import { useStore } from "@/lib/store";
import type { FeedItem, Profile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { IconBack } from "./icons";
import { PostCard } from "./PostCard";

/**
 * Profilseite – eigenes oder fremdes. Sichtbar ist ausschließlich, was die
 * Person veröffentlicht hat; das private Journal bleibt hier unsichtbar,
 * selbst auf dem eigenen Profil.
 */
export function ProfileView({
  handle,
  onBack,
  onOpenPost,
  onOpenProfile,
  onOpenSettings,
  onMenu,
  onReport,
  refreshToken,
}: {
  /** null = eigenes Profil */
  handle: string | null;
  onBack: (() => void) | null;
  onOpenPost: (item: FeedItem) => void;
  onOpenProfile: (handle: string) => void;
  onOpenSettings: () => void;
  onMenu: (item: FeedItem) => void;
  onReport: (handle: string) => void;
  refreshToken: number;
}) {
  const { session, setProfile, toast } = useStore();
  const target = handle ?? session.profile?.handle ?? null;

  const [profile, setLocalProfile] = useState<Profile | null>(
    handle === null ? session.profile : null,
  );
  const [items, setItems] = useState<FeedItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  /* Laden im Effekt, Zustand nur in den Rückrufen: so kann eine langsame
     Antwort für Profil A nicht das inzwischen geöffnete Profil B überschreiben. */
  useEffect(() => {
    if (!target) return;
    let alive = true;
    social
      .fetchProfile(target)
      .then((data) => {
        if (!alive) return;
        setLocalProfile(data.profile);
        setItems(data.items);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Profil nicht erreichbar");
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [target, refreshToken]);

  async function block() {
    if (!profile) return;
    try {
      await social.setBlock(profile.handle, true);
      toast(`@${profile.handle} ist blockiert`);
      onBack?.();
    } catch {
      toast("Blockieren hat nicht geklappt");
    }
  }

  async function toggleFollow() {
    if (!profile) return;
    const next = !profile.following;
    setLocalProfile({
      ...profile,
      following: next,
      followerCount: profile.followerCount + (next ? 1 : -1),
    });
    try {
      const { profile: updated } = await social.setFollow(profile.handle, next);
      setLocalProfile(updated);
    } catch {
      setLocalProfile(profile);
      toast("Das hat nicht geklappt");
    }
  }

  const toggleLike = useCallback(async (item: FeedItem) => {
    const next = !item.liked;
    setItems((current) =>
      current.map((i) =>
        i.id === item.id ? { ...i, liked: next, likeCount: i.likeCount + (next ? 1 : -1) } : i,
      ),
    );
    try {
      const result = await social.setLike(item.id, next);
      setItems((current) => current.map((i) => (i.id === item.id ? { ...i, ...result } : i)));
    } catch {
      setItems((current) =>
        current.map((i) =>
          i.id === item.id ? { ...i, liked: item.liked, likeCount: item.likeCount } : i,
        ),
      );
    }
  }, []);

  if (!target) {
    return (
      <section className="view">
        <div className="wrap">
          <div className="empty">
            <h2 className="emptyTitle">Profil wird vorbereitet …</h2>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="view" id="view-profile" aria-labelledby="profile-heading">
      <div className="wrap">
        {onBack && (
          <button className="btn btnGhost backBtn" type="button" onClick={onBack}>
            <IconBack />
            Zurück
          </button>
        )}

        {state === "error" && (
          <div className="empty">
            <h2 className="emptyTitle">Profil nicht gefunden</h2>
            <p className="emptyText">{error}</p>
          </div>
        )}

        {profile && (
          <>
            <header className="profileHead">
              <Avatar
                handle={profile.handle}
                name={profile.displayName}
                size={84}
                className="profileAvatar"
              />
              <h1 className="profileName" id="profile-heading">
                {profile.displayName}
              </h1>
              <p className="profileHandle">@{profile.handle}</p>
              {profile.bio && <p className="profileBio">{profile.bio}</p>}

              <div className="profileStats">
                <span className="profileStat">
                  <b>{profile.entryCount}</b>
                  {profile.entryCount === 1 ? "Beitrag" : "Beiträge"}
                </span>
                <span className="profileStat">
                  <b>{profile.followerCount}</b>
                  {profile.followerCount === 1 ? "Follower" : "Follower"}
                </span>
                <span className="profileStat">
                  <b>{profile.followingCount}</b>abonniert
                </span>
              </div>

              <div className="profileActions">
                {profile.isMe ? (
                  <>
                    <button className="btn" type="button" onClick={() => setEditing(true)}>
                      Profil bearbeiten
                    </button>
                    <button className="btn" type="button" onClick={onOpenSettings}>
                      Einstellungen
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className={`btn ${profile.following ? "" : "btnPrimary"}`}
                      type="button"
                      onClick={() => void toggleFollow()}
                    >
                      {profile.following ? "Folgst du" : "Folgen"}
                    </button>
                    <button className="btn" type="button" onClick={() => onReport(profile.handle)}>
                      Melden
                    </button>
                    <button
                      className="btn btnDanger"
                      type="button"
                      onClick={() => void block()}
                    >
                      Blockieren
                    </button>
                  </>
                )}
              </div>
            </header>

            {editing && profile.isMe && (
              <ProfileEditor
                profile={profile}
                onClose={() => setEditing(false)}
                onSaved={(updated) => {
                  setLocalProfile(updated);
                  setProfile(updated);
                  setEditing(false);
                  toast("Profil gespeichert");
                }}
              />
            )}

            {state === "ready" && items.length === 0 && (
              <div className="empty">
                <h2 className="emptyTitle">
                  {profile.isMe ? "Du hast noch nichts geteilt" : "Noch nichts Öffentliches"}
                </h2>
                <p className="emptyText">
                  {profile.isMe
                    ? "Dein Journal bleibt privat. Wenn du einen Eintrag zeigen möchtest, stell ihn beim Schreiben auf „Öffentlich“."
                    : "Diese Person hat bisher nichts veröffentlicht."}
                </p>
              </div>
            )}

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
          </>
        )}
      </div>
    </section>
  );
}

function ProfileEditor({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { profile: updated } = await social.saveProfile({ displayName, handle, bio });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card glass profileEditor" onSubmit={submit}>
      <div className="cardHead">
        <h2 className="cardTitle">Profil bearbeiten</h2>
      </div>

      <label className="fieldLabel" htmlFor="p-name">
        Name
      </label>
      <input
        id="p-name"
        className="lockField"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={60}
        disabled={busy}
      />

      <label className="fieldLabel" htmlFor="p-handle">
        Öffentlicher Name
      </label>
      <div className="handleField">
        <span aria-hidden="true">@</span>
        <input
          id="p-handle"
          className="lockField"
          value={handle}
          onChange={(e) => setHandle(e.target.value.toLowerCase())}
          maxLength={24}
          autoCapitalize="none"
          spellCheck={false}
          disabled={busy}
        />
      </div>

      <label className="fieldLabel" htmlFor="p-bio">
        Über dich
      </label>
      <textarea
        id="p-bio"
        className="bioField"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        maxLength={280}
        rows={3}
        placeholder="Ein Satz, der zu dir gehört."
        disabled={busy}
      />

      {error && (
        <p className="lockError" role="alert">
          {error}
        </p>
      )}

      <div className="btnRow" style={{ marginBottom: 0 }}>
        <button className="btn" type="button" onClick={onClose} disabled={busy}>
          Abbrechen
        </button>
        <button className="btn btnPrimary" type="submit" disabled={busy}>
          {busy ? "Speichert …" : "Speichern"}
        </button>
      </div>
    </form>
  );
}

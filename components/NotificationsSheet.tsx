"use client";

import { useEffect, useRef, useState } from "react";
import { relativeTime } from "@/lib/format";
import * as social from "@/lib/social";
import type { AppNotification } from "@/lib/types";
import { Avatar } from "./Avatar";
import { IconComment, IconHeart, IconUsers } from "./icons";

const TEXT: Record<AppNotification["kind"], string> = {
  like: "gefällt dein Eintrag",
  comment: "hat kommentiert",
  follow: "folgt dir jetzt",
};

function Icon({ kind }: { kind: AppNotification["kind"] }) {
  if (kind === "like") return <IconHeart />;
  if (kind === "comment") return <IconComment />;
  return <IconUsers />;
}

/**
 * In-App-Benachrichtigungen. Bewusst keine Push-Nachrichten: die bräuchten
 * einen Push-Dienst und die Erlaubnis des Geräts – und ein Tagebuch, das aufs
 * Schloss vibriert, will nicht jede Person.
 */
export function NotificationsSheet({
  onClose,
  onOpenProfile,
  onRead,
}: {
  onClose: () => void;
  onOpenProfile: (handle: string) => void;
  onRead: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    social
      .fetchNotifications()
      .then(({ items: list }) => {
        setItems(list);
        return social.markNotificationsRead();
      })
      .then(() => onRead())
      .catch(() => setItems([]));
  }, [onRead]);

  function requestClose() {
    setClosing(true);
    window.setTimeout(() => {
      ref.current?.close();
      onClose();
    }, 180);
  }

  return (
    <dialog
      ref={ref}
      className={`sheet${closing ? " sheetClosing" : ""}`}
      aria-label="Benachrichtigungen"
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) requestClose();
      }}
    >
      <div className="sheetForm">
        <header className="sheetHead">
          <button className="btn btnGhost" type="button" onClick={requestClose}>
            Fertig
          </button>
          <h2 className="sheetTitle">Benachrichtigungen</h2>
          <span style={{ minWidth: 62 }} />
        </header>

        <div className="sheetBody">
          {items === null && <p className="commentsHint">Wird geladen …</p>}
          {items?.length === 0 && (
            <div className="empty">
              <h2 className="emptyTitle">Noch nichts passiert</h2>
              <p className="emptyText">
                Hier landen Herzen, Kommentare und neue Follower zu dem, was du geteilt hast.
              </p>
            </div>
          )}

          {items?.map((n) => (
            <article className={`note${n.read ? "" : " noteUnread"}`} key={n.id}>
              <button
                className="noteAvatar"
                type="button"
                aria-label={`Profil von ${n.actor.displayName}`}
                onClick={() => {
                  requestClose();
                  onOpenProfile(n.actor.handle);
                }}
              >
                <Avatar handle={n.actor.handle} name={n.actor.displayName} size={38} />
                <span className={`noteKind noteKind--${n.kind}`} aria-hidden="true">
                  <Icon kind={n.kind} />
                </span>
              </button>
              <div className="noteBody">
                <p className="noteText">
                  <b>{n.actor.displayName}</b> {TEXT[n.kind]}
                  {n.entryTitle ? <span className="noteQuote"> „{n.entryTitle}“</span> : null}
                </p>
                <p className="noteTime">{relativeTime(n.createdAt)}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </dialog>
  );
}

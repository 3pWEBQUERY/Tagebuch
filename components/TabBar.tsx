"use client";

import { useRef } from "react";
import { Avatar } from "./Avatar";
import { IconBook, IconChart, IconUsers } from "./icons";

export type ViewId = "journal" | "feed" | "insights" | "profile";

export function TabBar({
  view,
  onView,
  profileHandle,
  profileName,
}: {
  view: ViewId;
  onView: (v: ViewId) => void;
  profileHandle: string;
  profileName: string;
}) {
  const ref = useRef<HTMLElement>(null);

  return (
    <nav
      ref={ref}
      className="tabbar glass"
      aria-label="Hauptnavigation"
      // Der Glanzpunkt folgt dem Zeiger – nur relevant, wo es einen gibt.
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el || e.pointerType !== "mouse") return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      }}
      onPointerLeave={() => ref.current?.style.setProperty("--mx", "50%")}
    >
      <button
        type="button"
        className={`tab${view === "journal" ? " tabActive" : ""}`}
        aria-current={view === "journal" ? "page" : undefined}
        onClick={() => onView("journal")}
      >
        <IconBook />
        <span>Journal</span>
      </button>

      <button
        type="button"
        className={`tab${view === "feed" ? " tabActive" : ""}`}
        aria-current={view === "feed" ? "page" : undefined}
        onClick={() => onView("feed")}
      >
        <IconUsers />
        <span>Feed</span>
      </button>

      <button
        type="button"
        className={`tab${view === "insights" ? " tabActive" : ""}`}
        aria-current={view === "insights" ? "page" : undefined}
        onClick={() => onView("insights")}
      >
        <IconChart />
        <span>Verlauf</span>
      </button>

      {/* Das eigene Profil trägt das eigene Bild – wie man es aus sozialen
          Apps kennt, und es macht den Tab auf einen Blick unterscheidbar. */}
      <button
        type="button"
        className={`tab tabProfile${view === "profile" ? " tabActive" : ""}`}
        aria-current={view === "profile" ? "page" : undefined}
        onClick={() => onView("profile")}
      >
        <Avatar handle={profileHandle} name={profileName} size={22} className="tabAvatar" />
        <span>Profil</span>
      </button>
    </nav>
  );
}

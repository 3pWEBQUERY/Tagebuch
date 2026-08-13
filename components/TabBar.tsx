"use client";

import { useRef } from "react";
import { IconBook, IconChart, IconGear } from "./icons";

export type ViewId = "journal" | "insights" | "settings";

const TABS: { id: ViewId; label: string; Icon: (p: { className?: string }) => React.JSX.Element }[] = [
  { id: "journal", label: "Journal", Icon: IconBook },
  { id: "insights", label: "Verlauf", Icon: IconChart },
  { id: "settings", label: "Mehr", Icon: IconGear },
];

export function TabBar({ view, onView }: { view: ViewId; onView: (v: ViewId) => void }) {
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
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`tab${view === id ? " tabActive" : ""}`}
          aria-current={view === id ? "page" : undefined}
          onClick={() => onView(id)}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

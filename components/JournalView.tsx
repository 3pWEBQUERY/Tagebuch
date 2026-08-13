"use client";

import { useMemo } from "react";
import { useClientValue } from "@/lib/client-value";
import { dayKey, dayLabel, fullDate, greeting, plural } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Entry } from "@/lib/types";
import { EntryCard } from "./EntryCard";
import { IconClose, IconDrop, IconHeart, IconSearch } from "./icons";

export type Filter = "all" | "fav" | "good" | "low";

const FILTERS: { id: Filter; label: string; heart?: boolean }[] = [
  { id: "all", label: "Alle" },
  { id: "fav", label: "Favoriten", heart: true },
  { id: "good", label: "Gute Tage" },
  { id: "low", label: "Schwere Tage" },
];

function matches(entry: Entry, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    entry.title.toLowerCase().includes(needle) ||
    entry.body.toLowerCase().includes(needle) ||
    entry.tags.some((t) => t.toLowerCase().includes(needle))
  );
}

type Props = {
  query: string;
  onQuery: (q: string) => void;
  filter: Filter;
  onFilter: (f: Filter) => void;
  onOpen: (entry: Entry) => void;
  onNew: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
};

export function JournalView({ query, onQuery, filter, onFilter, onOpen, onNew, searchRef }: Props) {
  const { entries, loaded } = useStore();
  // Erst im Browser – ein vorgerendertes Datum wäre das des Builds.
  const today = useClientValue(() => `${greeting()} · ${fullDate(Date.now())}`, "");

  const visible = useMemo(
    () =>
      entries.filter((e) => {
        if (!matches(e, query)) return false;
        if (filter === "fav") return e.favorite;
        if (filter === "good") return e.mood !== null && e.mood >= 4;
        if (filter === "low") return e.mood !== null && e.mood <= 2;
        return true;
      }),
    [entries, query, filter],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    visible.forEach((e) => {
      const key = dayKey(e.createdAt);
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    });
    return [...map.entries()];
  }, [visible]);

  const isFiltering = query.trim().length > 0 || filter !== "all";
  const subtitle = entries.length
    ? `${plural(entries.length, "Eintrag", "Einträge")} · ${plural(
        new Set(entries.map((e) => dayKey(e.createdAt))).size,
        "Tag",
        "Tage",
      )}`
    : "Dein Raum für alles, was dich beschäftigt.";

  return (
    <section className="view" id="view-journal" aria-labelledby="journal-heading">
      <div className="wrap">
        <div className="hero">
          <p className="heroKicker">{today}</p>
          <h1 className="heroTitle" id="journal-heading">
            Tagebuch
          </h1>
          <p className="heroSub">{subtitle}</p>
        </div>

        <div className="toolbar">
          <div className="search glass" role="search">
            <span className="searchIcon">
              <IconSearch />
            </span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Einträge durchsuchen"
              aria-label="Einträge durchsuchen"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button className="searchClear" type="button" aria-label="Suche löschen" onClick={() => onQuery("")}>
                <IconClose />
              </button>
            )}
          </div>

          <div className="chips" role="tablist" aria-label="Einträge filtern">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={`chip${filter === f.id ? " chipActive" : ""}`}
                onClick={() => onFilter(f.id)}
              >
                {f.heart && (
                  <span className="chipIco">
                    <IconHeart />
                  </span>
                )}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {!loaded && (
          <div className="list" aria-hidden="true">
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}

        {loaded && visible.length > 0 && (
          <div className="list">
            {groups.map(([key, list]) => (
              <div key={key} style={{ display: "contents" }}>
                <h2 className="groupHead">{dayLabel(list[0].createdAt)}</h2>
                {list.map((entry, i) => (
                  <EntryCard key={entry.id} entry={entry} query={query} index={i} onOpen={onOpen} />
                ))}
              </div>
            ))}
          </div>
        )}

        {loaded && visible.length === 0 && (
          <div className="empty">
            <div className="emptyArt glass" aria-hidden="true">
              <IconDrop />
            </div>
            {isFiltering ? (
              <>
                <h2 className="emptyTitle">Nichts gefunden</h2>
                <p className="emptyText">
                  Für diese Suche gibt es keinen Eintrag. Versuch ein anderes Wort oder setz die Filter zurück.
                </p>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    onQuery("");
                    onFilter("all");
                  }}
                >
                  Filter zurücksetzen
                </button>
              </>
            ) : (
              <>
                <h2 className="emptyTitle">Noch nichts geschrieben</h2>
                <p className="emptyText">Ein Satz genügt. Wie war dein Tag bisher?</p>
                <button className="btn btnPrimary" type="button" onClick={onNew}>
                  Ersten Eintrag schreiben
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

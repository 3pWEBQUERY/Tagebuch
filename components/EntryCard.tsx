"use client";

import { memo } from "react";
import { time } from "@/lib/format";
import { moodOf, type Entry } from "@/lib/types";
import { IconGlobe, IconHeart } from "./icons";

/** Hebt den Suchtreffer hervor, ohne HTML aus Nutzertext zu interpretieren. */
function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function titleOf(entry: Entry): string {
  if (entry.title.trim()) return entry.title.trim();
  const firstLine = entry.body.trim().split("\n")[0]?.trim();
  return firstLine ? firstLine.slice(0, 80) : "Ohne Titel";
}

function snippetOf(entry: Entry): string {
  const body = entry.body.trim();
  if (!entry.title.trim()) {
    const rest = body.split("\n").slice(1).join(" ").trim();
    return rest || (body ? "" : "Kein Text");
  }
  return body.replace(/\s+/g, " ");
}

type Props = {
  entry: Entry;
  query: string;
  index: number;
  onOpen: (entry: Entry) => void;
};

function EntryCardBase({ entry, query, index, onOpen }: Props) {
  const mood = moodOf(entry.mood);
  const snippet = snippetOf(entry);

  return (
    <button
      type="button"
      className="entry glass"
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      onClick={() => onOpen(entry)}
    >
      <span
        className="entryMood"
        style={mood ? ({ ["--mood" as string]: mood.color } as React.CSSProperties) : undefined}
        aria-hidden="true"
      >
        {mood ? mood.face : "·"}
      </span>

      <span className="entryMain">
        <span className="entryTop">
          <span className="entryTitle">{highlight(titleOf(entry), query)}</span>
          {entry.visibility === "public" && (
            <span className="entryPublic" title="Öffentlich sichtbar">
              <IconGlobe />
              <span className="sr-only">Öffentlich sichtbar</span>
            </span>
          )}
          {entry.favorite && (
            <span className="entryFav" aria-label="Favorit">
              <IconHeart />
            </span>
          )}
          <span className="entryTime">{time(entry.createdAt)}</span>
        </span>

        {snippet && <span className="entrySnippet">{highlight(snippet, query)}</span>}

        {entry.tags.length > 0 && (
          <span className="entryTags">
            {entry.tags.slice(0, 4).map((t) => (
              <span className="tag" key={t}>
                {t}
              </span>
            ))}
            {entry.tags.length > 4 && <span className="tag">+{entry.tags.length - 4}</span>}
          </span>
        )}
      </span>

      <span className="sr-only">
        {mood ? `Stimmung: ${mood.label}. ` : ""}
        Eintrag öffnen
      </span>
    </button>
  );
}

export const EntryCard = memo(EntryCardBase);

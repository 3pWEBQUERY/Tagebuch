"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { countWords, stamp } from "@/lib/format";
import { useStore } from "@/lib/store";
import { MOODS, type Entry, type MoodValue } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconClose, IconHeart, IconTrash } from "./icons";

const AUTOSAVE_MS = 700;
const CLOSE_MS = 180;

type Props = {
  entry: Entry;
  /** true, solange der Eintrag noch nie Inhalt hatte und deshalb nicht gespeichert wurde. */
  isNew: boolean;
  onClose: () => void;
};

export function EditorSheet({ entry, isNew, onClose }: Props) {
  const { save, remove, toast } = useStore();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState(entry.body);
  const [mood, setMood] = useState<MoodValue | null>(entry.mood);
  const [tags, setTags] = useState<string[]>(entry.tags);
  const [favorite, setFavorite] = useState(entry.favorite);
  const [tagDraft, setTagDraft] = useState("");
  const [savedHint, setSavedHint] = useState("");
  const [closing, setClosing] = useState(false);
  const [askDelete, setAskDelete] = useState(false);

  const persisted = useRef(!isNew);
  const dirty = useRef(false);

  const current = useCallback(
    (): Entry => ({
      ...entry,
      title: title.trim(),
      body,
      mood,
      tags,
      favorite,
      updatedAt: Date.now(),
    }),
    [entry, title, body, mood, tags, favorite],
  );

  const hasContent = title.trim() !== "" || body.trim() !== "" || tags.length > 0 || mood !== null;

  /* Dialog öffnen + Fokus setzen */
  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
    if (isNew) {
      requestAnimationFrame(() => bodyRef.current?.focus());
    }
  }, [isNew]);

  /* Textfeld wächst mit dem Text mit */
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  const flash = useCallback((text: string) => {
    setSavedHint(text);
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => setSavedHint(""), 1600);
  }, []);

  /* Automatisch sichern, kurz nachdem das Tippen aufhört */
  useEffect(() => {
    if (!dirty.current) return;
    if (!hasContent && !persisted.current) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void save(current()).then(() => {
        persisted.current = true;
        flash("Gesichert");
      });
    }, AUTOSAVE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [title, body, mood, tags, favorite, hasContent, current, save, flash]);

  const mark = () => {
    dirty.current = true;
  };

  const requestClose = useCallback(async () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (hasContent) {
      await save(current());
    } else if (persisted.current) {
      await remove(entry.id);
    }
    setClosing(true);
    window.setTimeout(() => {
      dialogRef.current?.close();
      onClose();
    }, CLOSE_MS);
  }, [hasContent, save, current, remove, entry.id, onClose]);

  /** Nimmt mehrere Themen auf einmal an – beim schnellen Tippen kommen
   *  „Sport,Schlaf,“ sonst als ein einziger Wert im selben Change-Event an. */
  function addTags(raw: string[]) {
    const values = raw.map((v) => v.trim().replace(/^#/, "").slice(0, 24)).filter(Boolean);
    setTagDraft("");
    if (!values.length) return;
    mark();
    setTags((prev) => {
      const next = [...prev];
      values.forEach((v) => {
        if (next.length < 24 && !next.some((t) => t.toLowerCase() === v.toLowerCase())) next.push(v);
      });
      return next;
    });
  }

  const words = countWords(`${title} ${body}`);

  return (
    <>
      <dialog
        ref={dialogRef}
        className={`sheet${closing ? " sheetClosing" : ""}`}
        aria-label="Eintrag bearbeiten"
        onCancel={(e) => {
          e.preventDefault();
          void requestClose();
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) void requestClose();
        }}
      >
        <div className="sheetForm">
          <header className="sheetHead">
            <button className="btn btnGhost" type="button" onClick={() => void requestClose()}>
              Fertig
            </button>
            <h2 className="sheetTitle">{isNew ? "Neuer Eintrag" : "Eintrag"}</h2>
            <div className="sheetActions">
              <button
                className="iconBtn"
                type="button"
                aria-pressed={favorite}
                aria-label={favorite ? "Favorit entfernen" : "Als Favorit markieren"}
                onClick={() => {
                  mark();
                  setFavorite((f) => !f);
                }}
              >
                <IconHeart />
              </button>
              <button
                className="iconBtn iconBtnDanger"
                type="button"
                aria-label="Eintrag löschen"
                onClick={() => {
                  if (!persisted.current && !hasContent) {
                    void requestClose();
                    return;
                  }
                  setAskDelete(true);
                }}
              >
                <IconTrash />
              </button>
            </div>
          </header>

          <div className="sheetBody">
            <p className="sheetStamp">{stamp(entry.createdAt)}</p>

            <input
              className="fieldTitle"
              type="text"
              value={title}
              onChange={(e) => {
                mark();
                setTitle(e.target.value);
              }}
              placeholder="Titel (optional)"
              aria-label="Titel"
              maxLength={120}
              autoComplete="off"
            />

            <fieldset className="moods">
              <legend className="moodsLegend">Wie fühlst du dich?</legend>
              <div className="moodsRow">
                {MOODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    className="mood"
                    aria-pressed={mood === m.value}
                    style={{ ["--mood" as string]: m.color } as React.CSSProperties}
                    onClick={() => {
                      mark();
                      setMood(mood === m.value ? null : m.value);
                    }}
                  >
                    <span className="moodFace" aria-hidden="true">
                      {m.face}
                    </span>
                    <span className="moodName">{m.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <textarea
              ref={bodyRef}
              className="fieldBody"
              value={body}
              onChange={(e) => {
                mark();
                setBody(e.target.value);
              }}
              placeholder="Schreib einfach los …"
              aria-label="Eintrag"
              rows={6}
            />

            <div>
              <label className="tagsLabel" htmlFor="tag-input">
                Themen
              </label>
              <div className="tagsBox glass">
                {tags.map((t) => (
                  <span className="tagChip" key={t}>
                    {t}
                    <button
                      type="button"
                      aria-label={`Thema ${t} entfernen`}
                      onClick={() => {
                        mark();
                        setTags(tags.filter((x) => x !== t));
                      }}
                    >
                      <IconClose />
                    </button>
                  </span>
                ))}
                <input
                  id="tag-input"
                  type="text"
                  value={tagDraft}
                  placeholder={tags.length ? "weiteres Thema …" : "z. B. Arbeit, Schlaf, Familie"}
                  autoComplete="off"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v.includes(",")) {
                      setTagDraft(v);
                      return;
                    }
                    const parts = v.split(",");
                    const rest = parts.pop() ?? "";
                    addTags(parts);
                    setTagDraft(rest);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTags([tagDraft]);
                    } else if (e.key === "Backspace" && !tagDraft && tags.length) {
                      mark();
                      setTags(tags.slice(0, -1));
                    }
                  }}
                  onBlur={() => addTags([tagDraft])}
                />
              </div>
            </div>
          </div>

          <footer className="sheetFoot">
            <span>
              {words} {words === 1 ? "Wort" : "Wörter"}
            </span>
            <span className="sheetSaved" style={{ opacity: savedHint ? 1 : 0 }} aria-live="polite">
              {savedHint}
            </span>
          </footer>
        </div>
      </dialog>

      <ConfirmDialog
        open={askDelete}
        title="Eintrag löschen?"
        text="Der Eintrag verschwindet aus deinem Tagebuch. Du kannst das direkt danach rückgängig machen."
        onCancel={() => setAskDelete(false)}
        onConfirm={async () => {
          setAskDelete(false);
          if (timerRef.current) window.clearTimeout(timerRef.current);
          if (persisted.current) await remove(entry.id, { undo: true });
          else toast("Eintrag verworfen");
          persisted.current = false;
          setClosing(true);
          window.setTimeout(() => {
            dialogRef.current?.close();
            onClose();
          }, CLOSE_MS);
        }}
      />
    </>
  );
}

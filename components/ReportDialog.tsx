"use client";

import { useEffect, useRef, useState } from "react";
import { reportContent } from "@/lib/social";
import { REPORT_REASONS } from "@/lib/types";

export type ReportTarget = {
  handle?: string;
  entryId?: string;
  commentId?: string;
  /** Was in der Rückfrage steht – „diesen Beitrag“, „@name“ … */
  label: string;
};

/**
 * Melden ist kein Löschknopf: die Meldung wird festgehalten, entfernt aber
 * nichts. Wer jemanden nicht mehr sehen will, blockiert – das wirkt sofort
 * und hängt nicht an einer Entscheidung von außen.
 */
export function ReportDialog({
  target,
  onClose,
  onDone,
}: {
  target: ReportTarget;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].id);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await reportContent({ ...target, reason, note });
      onDone("Danke – die Meldung ist angekommen.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Melden fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="confirm reportDialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <form onSubmit={submit}>
        <h2 className="confirmTitle">Melden</h2>
        <p className="confirmText">
          Du meldest {target.label}. Die Meldung wird gespeichert und geprüft – am Inhalt ändert
          sich dadurch zunächst nichts.
        </p>

        <div className="reasons" role="radiogroup" aria-label="Grund">
          {REPORT_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={reason === r.id}
              className="reason"
              onClick={() => setReason(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>

        <textarea
          className="bioField reportNote"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Willst du etwas ergänzen? (optional)"
          aria-label="Ergänzung"
          maxLength={1000}
          rows={2}
          disabled={busy}
        />

        {error && (
          <p className="lockError" role="alert">
            {error}
          </p>
        )}

        <div className="confirmRow">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button className="btn btnDanger" type="submit" disabled={busy}>
            {busy ? "Wird gesendet …" : "Melden"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

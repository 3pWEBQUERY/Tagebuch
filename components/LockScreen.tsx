"use client";

import { useState } from "react";
import { unlock } from "@/lib/sync";
import { IconDrop } from "./icons";

/**
 * Wird nur gezeigt, wenn der Server eine Passphrase verlangt und dieses Gerät
 * noch nie offen war. Danach hält das Sitzungs-Cookie ein Jahr – im Alltag
 * sieht man diesen Bildschirm also genau einmal pro Gerät.
 */
export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await unlock(password);
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lock">
      <form className="lockCard glass" onSubmit={submit}>
        <div className="lockMark" aria-hidden="true">
          <IconDrop />
        </div>
        <h1 className="lockTitle">Tagebuch</h1>
        <p className="lockText">Dieses Tagebuch ist geschützt. Gib die Passphrase ein, um es zu öffnen.</p>

        <input
          className="lockField"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Passphrase"
          aria-label="Passphrase"
          autoComplete="current-password"
          autoFocus
          disabled={busy}
        />

        {error && (
          <p className="lockError" role="alert">
            {error}
          </p>
        )}

        <button className="btn btnPrimary btnFull" type="submit" disabled={busy || !password}>
          {busy ? "Wird geprüft …" : "Öffnen"}
        </button>
      </form>
    </div>
  );
}

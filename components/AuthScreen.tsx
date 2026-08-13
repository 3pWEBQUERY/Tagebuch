"use client";

import { useState } from "react";
import { login, register, type SessionUser } from "@/lib/auth";
import type { Profile } from "@/lib/types";
import { IconDrop } from "./icons";

type Mode = "login" | "register";

export function AuthScreen({
  signupCodeRequired,
  onSignedIn,
}: {
  signupCodeRequired: boolean;
  onSignedIn: (result: { user: SessionUser; profile: Profile | null }) => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !email || !password) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "login"
          ? await login(email, password)
          : await register(email, password, signupCodeRequired ? code : undefined);
      onSignedIn(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Das hat nicht geklappt.");
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
        <p className="lockText">
          {mode === "login"
            ? "Melde dich an, um deine Einträge auf allen Geräten zu haben."
            : "Leg ein Konto an – deine Einträge bleiben privat und nur für dich sichtbar."}
        </p>

        <div className="segmented lockTabs" role="tablist" aria-label="Anmelden oder registrieren">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => switchMode("login")}
          >
            Anmelden
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            onClick={() => switchMode("register")}
          >
            Registrieren
          </button>
          <span
            className="segmentedThumb"
            aria-hidden="true"
            style={{ width: "calc((100% - 6px) / 2)", transform: `translateX(${mode === "login" ? 0 : 100}%)` }}
          />
        </div>

        <input
          className="lockField"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail"
          aria-label="E-Mail"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={busy}
        />

        <input
          className="lockField"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "login" ? "Passwort" : "Passwort (mind. 8 Zeichen)"}
          aria-label="Passwort"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "register" ? 8 : undefined}
          required
          disabled={busy}
        />

        {mode === "register" && signupCodeRequired && (
          <input
            className="lockField"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Einladungscode"
            aria-label="Einladungscode"
            autoComplete="off"
            required
            disabled={busy}
          />
        )}

        {error && (
          <p className="lockError" role="alert">
            {error}
          </p>
        )}

        <button className="btn btnPrimary btnFull" type="submit" disabled={busy || !email || !password}>
          {busy ? "Einen Moment …" : mode === "login" ? "Anmelden" : "Konto anlegen"}
        </button>

        <p className="lockHint">
          {mode === "login" ? (
            <>
              Noch kein Konto?{" "}
              <button type="button" className="linkBtn" onClick={() => switchMode("register")}>
                Registrieren
              </button>
            </>
          ) : (
            <>
              Schon ein Konto?{" "}
              <button type="button" className="linkBtn" onClick={() => switchMode("login")}>
                Anmelden
              </button>
            </>
          )}
        </p>
      </form>
    </div>
  );
}

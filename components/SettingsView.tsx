"use client";

import { useRef, useState } from "react";
import { stamp } from "@/lib/format";
import type { InstallState } from "@/lib/install";
import { useStore, type SyncStatus } from "@/lib/store";
import { ACCENTS, normalizeEntry, type Entry, type ThemePref } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";

const THEMES: { id: ThemePref; label: string }[] = [
  { id: "light", label: "Hell" },
  { id: "dark", label: "Dunkel" },
  { id: "system", label: "System" },
];

const SYNC_LABEL: Record<SyncStatus, string> = {
  idle: "Abgeglichen",
  syncing: "Abgleich läuft …",
  offline: "Offline – wird nachgeholt",
  error: "Abgleich fehlgeschlagen",
  disabled: "Keine Datenbank verbunden",
};

export function SettingsView({ install }: { install: InstallState }) {
  const { entries, theme, setTheme, accent, setAccent, importMany, wipe, toast, sync, syncNow } =
    useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [askWipe, setAskWipe] = useState(false);

  const themeIndex = THEMES.findIndex((t) => t.id === theme);

  function exportJson() {
    const payload = {
      app: "Tagebuch",
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tagebuch-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`${entries.length} Einträge exportiert`);
  }

  async function importJson(file: File) {
    try {
      const raw: unknown = JSON.parse(await file.text());
      const list: unknown[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { entries?: unknown[] })?.entries)
          ? ((raw as { entries: unknown[] }).entries ?? [])
          : [];
      const clean = list.map(normalizeEntry).filter((e): e is Entry => e !== null);
      if (!clean.length) {
        toast("Keine gültigen Einträge in der Datei");
        return;
      }
      const n = await importMany(clean);
      toast(`${n} ${n === 1 ? "Eintrag" : "Einträge"} importiert`);
    } catch {
      toast("Datei konnte nicht gelesen werden");
    }
  }

  return (
    <section className="view" id="view-settings" aria-labelledby="settings-heading">
      <div className="wrap">
        <div className="hero">
          <p className="heroKicker">Deine App</p>
          <h1 className="heroTitle" id="settings-heading">
            Einstellungen
          </h1>
        </div>

        <section className="card glass" aria-labelledby="theme-h">
          <div className="cardHead">
            <h2 className="cardTitle" id="theme-h">
              Erscheinungsbild
            </h2>
          </div>

          <div className="segmented" role="radiogroup" aria-labelledby="theme-h">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={theme === t.id}
                onClick={() => setTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
            <span
              className="segmentedThumb"
              aria-hidden="true"
              style={{ transform: `translateX(${Math.max(0, themeIndex) * 100}%)` }}
            />
          </div>

          <div className="row">
            <span className="rowLabel">Akzentfarbe</span>
            <div className="swatches" role="radiogroup" aria-label="Akzentfarbe">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={accent === a.hex}
                  aria-label={a.name}
                  title={a.name}
                  className="swatch"
                  style={{ ["--c" as string]: a.hex } as React.CSSProperties}
                  onClick={() => setAccent(a.hex)}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="card glass" aria-labelledby="sync-h">
          <div className="cardHead">
            <h2 className="cardTitle" id="sync-h">
              Synchronisierung
            </h2>
            <span className={`syncDot syncDot--${sync.status}`} aria-hidden="true" />
          </div>
          <div className="row rowBetween" style={{ borderTop: 0, paddingTop: 0 }}>
            <div>
              <span className="rowLabel">{SYNC_LABEL[sync.status]}</span>
              <span className="rowHint">
                {sync.error
                  ? sync.error
                  : sync.lastSyncedAt
                    ? `Zuletzt abgeglichen: ${stamp(sync.lastSyncedAt)}`
                    : "Noch kein Abgleich gelaufen."}
              </span>
            </div>
            <button
              className="btn"
              type="button"
              onClick={() => void syncNow()}
              disabled={sync.status === "syncing"}
            >
              {sync.status === "syncing" ? "Läuft …" : "Jetzt abgleichen"}
            </button>
          </div>
          <p className="cardText" style={{ margin: "4px 0 0" }}>
            Geschrieben wird immer zuerst auf dieses Gerät – der Abgleich mit der Datenbank läuft
            danach. Ohne Netz bleibt alles bedienbar, Änderungen gehen beim nächsten Mal mit.
          </p>
        </section>

        <section className="card glass" aria-labelledby="data-h">
          <div className="cardHead">
            <h2 className="cardTitle" id="data-h">
              Deine Daten
            </h2>
          </div>
          <p className="cardText">
            Einträge werden auf dem Gerät gespeichert und mit deiner Postgres-Datenbank abgeglichen.
            Eine Anmeldung gibt es noch nicht: Wer die Adresse dieser App kennt, sieht die Einträge.
            Ein Export bleibt deine Sicherung.
          </p>
          <div className="btnRow">
            <button className="btn" type="button" onClick={exportJson} disabled={!entries.length}>
              Exportieren
            </button>
            <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
              Importieren
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importJson(file);
                e.target.value = "";
              }}
            />
          </div>
          <button className="btn btnDanger btnFull" type="button" onClick={() => setAskWipe(true)}>
            Alle Einträge löschen
          </button>
        </section>

        <section className="card glass" aria-labelledby="app-h">
          <div className="cardHead">
            <h2 className="cardTitle" id="app-h">
              App
            </h2>
          </div>
          <div className="row rowBetween" style={{ borderTop: 0, paddingTop: 0 }}>
            <div>
              <span className="rowLabel">Auf dem Gerät installieren</span>
              <span className="rowHint">
                {install.installed
                  ? "Läuft bereits als installierte App."
                  : install.canInstall
                    ? "Als eigenständige App öffnen – auch offline."
                    : "Im Browsermenü „Zum Home-Bildschirm“ bzw. „Installieren“ wählen."}
              </span>
            </div>
            {install.canInstall && (
              <button
                className="btn btnPrimary"
                type="button"
                onClick={async () => {
                  const ok = await install.install();
                  if (ok) toast("Tagebuch installiert");
                }}
              >
                Installieren
              </button>
            )}
          </div>
          <div className="row rowBetween">
            <div>
              <span className="rowLabel">Version</span>
              <span className="rowHint">Tagebuch 1.0 · offline-fähig</span>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={askWipe}
        title="Alles löschen?"
        text={`${entries.length} ${entries.length === 1 ? "Eintrag wird" : "Einträge werden"} unwiderruflich entfernt. Exportiere vorher, wenn du sie behalten willst.`}
        confirmLabel="Endgültig löschen"
        onCancel={() => setAskWipe(false)}
        onConfirm={async () => {
          setAskWipe(false);
          await wipe();
          toast("Alle Einträge gelöscht");
        }}
      />
    </section>
  );
}

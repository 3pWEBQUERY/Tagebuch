import "server-only";

import { Pool } from "pg";

/**
 * Datenmodell. Bewusst im Code und nicht als Datei daneben: so kann es beim
 * Deployment nicht fehlen. Eine Tabelle genügt – Einträge entstehen auf dem
 * Gerät (die id kommt vom Client), Gelöschtes bleibt als Grabstein stehen,
 * sonst käme es beim nächsten Abgleich von einem anderen Gerät zurück.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS entries (
    id          text        PRIMARY KEY,
    created_at  timestamptz NOT NULL,
    updated_at  timestamptz NOT NULL,
    title       text        NOT NULL DEFAULT '',
    body        text        NOT NULL DEFAULT '',
    mood        smallint,
    tags        text[]      NOT NULL DEFAULT '{}',
    favorite    boolean     NOT NULL DEFAULT false,
    deleted_at  timestamptz,
    CONSTRAINT entries_mood_range CHECK (mood IS NULL OR (mood BETWEEN 1 AND 5))
  );
  CREATE INDEX IF NOT EXISTS entries_updated_at_idx ON entries (updated_at);
`;

/**
 * Ein Pool pro Prozess. Im Dev-Modus überlebt er den Hot Reload nur, wenn er
 * am globalThis hängt – sonst sammeln sich mit jedem Neuladen offene Verbindungen an.
 */
const globalForDb = globalThis as unknown as {
  tagebuchPool?: Pool;
  tagebuchSchema?: Promise<void>;
};

export function isConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL fehlt – siehe .env.example.");
  }
  if (!globalForDb.tagebuchPool) {
    globalForDb.tagebuchPool = new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      // Railway-Postgres spricht TLS mit eigenem Zertifikat; lokal ist es meist aus.
      ssl: needsSsl(url) ? { rejectUnauthorized: false } : undefined,
    });
    globalForDb.tagebuchPool.on("error", (err) => {
      console.error("[db] Verbindungsfehler im Pool:", err.message);
    });
  }
  return globalForDb.tagebuchPool;
}

function needsSsl(url: string): boolean {
  if (/sslmode=disable/.test(url)) return false;
  return !/localhost|127\.0\.0\.1/.test(url);
}

/** Legt das Schema beim ersten Zugriff an – einmal pro Prozess, nicht pro Anfrage. */
export function ensureSchema(): Promise<void> {
  if (!globalForDb.tagebuchSchema) {
    globalForDb.tagebuchSchema = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((err) => {
        // Fehlschlag nicht zwischenspeichern, sonst bleibt der Prozess dauerhaft kaputt.
        globalForDb.tagebuchSchema = undefined;
        throw err;
      });
  }
  return globalForDb.tagebuchSchema;
}

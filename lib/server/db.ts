import "server-only";

import { Pool } from "pg";

/**
 * Datenmodell. Bewusst im Code und nicht als Datei daneben: so kann es beim
 * Deployment nicht fehlen. Eine Tabelle genügt – Einträge entstehen auf dem
 * Gerät (die id kommt vom Client), Gelöschtes bleibt als Grabstein stehen,
 * sonst käme es beim nächsten Abgleich von einem anderen Gerät zurück.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            text        PRIMARY KEY,
    email         text        NOT NULL UNIQUE,
    password_hash text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
  );

  -- Profil. Der Handle ist die öffentliche Adresse (@name); die E-Mail bleibt
  -- privat und taucht nirgends im Sozialen auf.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS handle       text;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS bio          text NOT NULL DEFAULT '';
  CREATE UNIQUE INDEX IF NOT EXISTS users_handle_key ON users (lower(handle));

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
  -- Einträge gehören ab jetzt einem Konto. Bewusst nachträglich und ohne
  -- NOT NULL: eine bestehende Tabelle soll sich fügen, statt beim Start zu
  -- brechen. Zeilen ohne Konto sind für keine Abfrage sichtbar und laufen
  -- über das Grabstein-Aufräumen aus.
  ALTER TABLE entries ADD COLUMN IF NOT EXISTS user_id text;

  -- Sichtbarkeit. Der Vorgabewert ist 'private' und das ist keine Kosmetik:
  -- ein Tagebuch, das versehentlich öffentlich wird, ist ein Schaden, den
  -- man nicht zurücknehmen kann. Veröffentlicht wird nur auf Ansage.
  ALTER TABLE entries ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';
  ALTER TABLE entries ADD COLUMN IF NOT EXISTS published_at timestamptz;

  CREATE INDEX IF NOT EXISTS entries_updated_at_idx ON entries (updated_at);
  CREATE INDEX IF NOT EXISTS entries_user_updated_idx ON entries (user_id, updated_at);
  -- Der Feed fragt immer „öffentlich, nicht gelöscht, neueste zuerst“.
  CREATE INDEX IF NOT EXISTS entries_public_idx
    ON entries (published_at DESC)
    WHERE visibility = 'public' AND deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS follows (
    follower_id text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id),
    CONSTRAINT follows_not_self CHECK (follower_id <> followee_id)
  );
  CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows (followee_id);

  CREATE TABLE IF NOT EXISTS likes (
    entry_id   text        NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    user_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (entry_id, user_id)
  );

  -- Bilder liegen in der Datenbank statt in einem Objektspeicher: eine
  -- Abhängigkeit weniger, und bei einem Tagebuch geht es um wenige Fotos je
  -- Person. Die Größe wird schon im Browser auf ~1600px gerechnet.
  CREATE TABLE IF NOT EXISTS photos (
    id         text        PRIMARY KEY,
    user_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mime       text        NOT NULL,
    width      integer     NOT NULL,
    height     integer     NOT NULL,
    bytes      bytea       NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE entries ADD COLUMN IF NOT EXISTS photo_id text;

  -- Wer blockiert, verschwindet in beide Richtungen: keine Beiträge, keine
  -- Kommentare, kein Profil, keine Benachrichtigungen.
  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT blocks_not_self CHECK (blocker_id <> blocked_id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id             text        PRIMARY KEY,
    reporter_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id text,
    entry_id       text,
    comment_id     text,
    reason         text        NOT NULL,
    note           text        NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id         text        PRIMARY KEY,
    user_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id   text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       text        NOT NULL,
    entry_id   text,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at    timestamptz
  );
  CREATE INDEX IF NOT EXISTS notifications_user_idx
    ON notifications (user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS comments (
    id         text        PRIMARY KEY,
    entry_id   text        NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    user_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS comments_entry_idx ON comments (entry_id, created_at);
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

import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/server/auth";
import { ensureSchema, getPool, isConfigured } from "@/lib/server/db";
import { normalizeEntry, type Entry } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Tombstone = { id: string; deletedAt: number };

type SyncRequest = {
  /** Serverzeit des letzten erfolgreichen Abgleichs, in Millisekunden. */
  since?: number | null;
  entries?: unknown[];
  deletions?: unknown[];
};

type SyncResponse = {
  serverTime: number;
  entries: Entry[];
  deletions: Tombstone[];
};

const MAX_BATCH = 500;

const SELECT_CHANGED = `
  SELECT id,
         (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS created_at,
         (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint AS updated_at,
         title, body, mood, tags, favorite,
         (EXTRACT(EPOCH FROM deleted_at) * 1000)::bigint AS deleted_at
    FROM entries
   WHERE updated_at > to_timestamp($1 / 1000.0)
   ORDER BY updated_at
`;

/* Beide Seiten dürfen offline weiterarbeiten – bei Kollisionen gewinnt die
   jüngere Fassung (updated_at). Deshalb das WHERE in beiden Upserts. */
const UPSERT_ENTRY = `
  INSERT INTO entries (id, created_at, updated_at, title, body, mood, tags, favorite, deleted_at)
  VALUES ($1, to_timestamp($2 / 1000.0), to_timestamp($3 / 1000.0), $4, $5, $6, $7, $8, NULL)
  ON CONFLICT (id) DO UPDATE
     SET created_at = LEAST(entries.created_at, EXCLUDED.created_at),
         updated_at = EXCLUDED.updated_at,
         title      = EXCLUDED.title,
         body       = EXCLUDED.body,
         mood       = EXCLUDED.mood,
         tags       = EXCLUDED.tags,
         favorite   = EXCLUDED.favorite,
         deleted_at = NULL
   WHERE entries.updated_at < EXCLUDED.updated_at
`;

const UPSERT_TOMBSTONE = `
  INSERT INTO entries (id, created_at, updated_at, deleted_at)
  VALUES ($1, to_timestamp($2 / 1000.0), to_timestamp($2 / 1000.0), to_timestamp($2 / 1000.0))
  ON CONFLICT (id) DO UPDATE
     SET updated_at = EXCLUDED.updated_at,
         deleted_at = EXCLUDED.deleted_at
   WHERE entries.updated_at <= EXCLUDED.updated_at
`;

/**
 * Grabsteine sind irgendwann erledigt. 90 Tage sind der Kompromiss: lange genug,
 * dass ein selten genutztes Zweitgerät die Löschung noch mitbekommt, kurz genug,
 * dass die Tabelle nicht endlos mit Leichen wächst.
 */
const PRUNE_TOMBSTONES = `
  DELETE FROM entries
   WHERE deleted_at IS NOT NULL
     AND deleted_at < now() - interval '90 days'
`;

type Row = {
  id: string;
  created_at: string;
  updated_at: string;
  title: string | null;
  body: string | null;
  mood: number | null;
  tags: string[] | null;
  favorite: boolean;
  deleted_at: string | null;
};

/** bigint kommt aus node-postgres als String – hier zurück in echte Zahlen. */
function toEntry(row: Row): Entry {
  return {
    id: row.id,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    title: row.title ?? "",
    body: row.body ?? "",
    mood: (row.mood as Entry["mood"]) ?? null,
    tags: row.tags ?? [],
    favorite: row.favorite,
  };
}

function parseTombstone(value: unknown): Tombstone | null {
  if (typeof value !== "object" || value === null) return null;
  const t = value as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.deletedAt !== "number") return null;
  return { id: t.id, deletedAt: t.deletedAt };
}

function notConfigured() {
  return NextResponse.json(
    { error: "Keine Datenbank verbunden. DATABASE_URL setzen – siehe .env.example." },
    { status: 503 },
  );
}

function locked() {
  return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
}

function failed(err: unknown) {
  const message = err instanceof Error ? err.message : "Unbekannter Fehler";
  console.error("[api/entries]", message);
  return NextResponse.json({ error: `Datenbank nicht erreichbar: ${message}` }, { status: 502 });
}

/** Nur abholen – für einen Abgleich ohne eigene Änderungen. */
export async function GET(request: Request) {
  if (!(await isAuthenticated())) return locked();
  if (!isConfigured()) return notConfigured();
  const since = Number(new URL(request.url).searchParams.get("since") ?? 0) || 0;
  try {
    await ensureSchema();
    const { rows } = await getPool().query<Row>(SELECT_CHANGED, [since]);
    return NextResponse.json(split(rows));
  } catch (err) {
    return failed(err);
  }
}

/** Eigene Änderungen schicken und im selben Zug die fremden abholen. */
export async function POST(request: Request) {
  if (!(await isAuthenticated())) return locked();
  if (!isConfigured()) return notConfigured();

  let payload: SyncRequest;
  try {
    payload = (await request.json()) as SyncRequest;
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  const entries = (payload.entries ?? [])
    .slice(0, MAX_BATCH)
    .map(normalizeEntry)
    .filter((e): e is Entry => e !== null);
  const deletions = (payload.deletions ?? [])
    .slice(0, MAX_BATCH)
    .map(parseTombstone)
    .filter((t): t is Tombstone => t !== null);
  const since = typeof payload.since === "number" ? payload.since : 0;

  try {
    await ensureSchema();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      for (const e of entries) {
        await client.query(UPSERT_ENTRY, [
          e.id,
          e.createdAt,
          e.updatedAt,
          e.title,
          e.body,
          e.mood,
          e.tags,
          e.favorite,
        ]);
      }
      for (const t of deletions) {
        await client.query(UPSERT_TOMBSTONE, [t.id, t.deletedAt]);
      }
      await client.query(PRUNE_TOMBSTONES);
      // Erst nach dem Schreiben lesen, damit der Aufrufer einen konsistenten Stand bekommt.
      const { rows } = await client.query<Row>(SELECT_CHANGED, [since]);
      await client.query("COMMIT");
      return NextResponse.json(split(rows, entries));
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return failed(err);
  }
}

/** Trennt geänderte von gelöschten Zeilen; eigene Rückläufer fallen raus. */
function split(rows: Row[], own: Entry[] = []): SyncResponse {
  const mine = new Map(own.map((e) => [e.id, e.updatedAt]));
  const result: SyncResponse = { serverTime: Date.now(), entries: [], deletions: [] };
  for (const row of rows) {
    if (row.deleted_at) {
      result.deletions.push({ id: row.id, deletedAt: Number(row.deleted_at) });
    } else if (mine.get(row.id) !== Number(row.updated_at)) {
      result.entries.push(toEntry(row));
    }
  }
  return result;
}

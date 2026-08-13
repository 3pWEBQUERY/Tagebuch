import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "./db";
import type { Comment, FeedItem, MoodValue, Profile } from "../types";

/**
 * Alles Öffentliche der App: Profile, Feed, Folgen, Herzen, Kommentare.
 *
 * Eine Regel zieht sich durch jede Abfrage: sichtbar ist ausschließlich, was
 * visibility = 'public' trägt und nicht gelöscht ist. Private Einträge tauchen
 * hier nirgends auf – auch nicht als Zahl in einer Statistik.
 */

const PUBLIC = "e.visibility = 'public' AND e.deleted_at IS NULL";

/* ── Handles ───────────────────────────────────────────────── */

export function slugifyHandle(raw: string): string {
  const base = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9_.]/g, "")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 24);
  return base.length >= 3 ? base : `tagebuch${Math.floor(Math.random() * 9000 + 1000)}`;
}

export function handleProblem(handle: string): string | null {
  if (handle.length < 3) return "Der Name braucht mindestens 3 Zeichen.";
  if (handle.length > 24) return "Der Name darf höchstens 24 Zeichen haben.";
  if (!/^[a-z0-9_.]+$/.test(handle)) {
    return "Erlaubt sind Kleinbuchstaben, Ziffern, Punkt und Unterstrich.";
  }
  return null;
}

/** Sucht einen freien Handle – bei Kollision mit angehängter Zahl. */
export async function uniqueHandle(wish: string, client?: PoolClient): Promise<string> {
  const runner = client ?? getPool();
  const base = slugifyHandle(wish);
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`.slice(0, 24);
    const { rowCount } = await runner.query("SELECT 1 FROM users WHERE lower(handle) = $1", [
      candidate,
    ]);
    if (rowCount === 0) return candidate;
  }
  return `${base}${randomUUID().slice(0, 6)}`.slice(0, 24);
}

/** Gibt Konten, die noch kein Profil haben, eines – etwa nach einem Upgrade. */
export async function ensureProfile(userId: string, email: string): Promise<void> {
  const { rows } = await getPool().query<{ handle: string | null }>(
    "SELECT handle FROM users WHERE id = $1",
    [userId],
  );
  if (rows[0]?.handle) return;
  const handle = await uniqueHandle(email.split("@")[0] ?? "tagebuch");
  await getPool().query(
    `UPDATE users SET handle = $2, display_name = COALESCE(display_name, $3) WHERE id = $1`,
    [userId, handle, handle],
  );
}

/* ── Profile ───────────────────────────────────────────────── */

type ProfileRow = {
  id: string;
  handle: string;
  display_name: string | null;
  bio: string;
  entry_count: string;
  follower_count: string;
  following_count: string;
  following: boolean;
};

const PROFILE_SELECT = `
  SELECT u.id, u.handle, u.display_name, u.bio,
         (SELECT count(*) FROM entries e
           WHERE e.user_id = u.id AND ${PUBLIC})                      AS entry_count,
         (SELECT count(*) FROM follows f WHERE f.followee_id = u.id)  AS follower_count,
         (SELECT count(*) FROM follows f WHERE f.follower_id = u.id)  AS following_count,
         EXISTS(SELECT 1 FROM follows f
                 WHERE f.followee_id = u.id AND f.follower_id = $2)    AS following
    FROM users u
`;

function toProfile(row: ProfileRow, viewerId: string): Profile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name || row.handle,
    bio: row.bio ?? "",
    entryCount: Number(row.entry_count),
    followerCount: Number(row.follower_count),
    followingCount: Number(row.following_count),
    following: row.following,
    isMe: row.id === viewerId,
  };
}

export async function profileByHandle(handle: string, viewerId: string): Promise<Profile | null> {
  const { rows } = await getPool().query<ProfileRow>(
    `${PROFILE_SELECT} WHERE lower(u.handle) = lower($1)`,
    [handle, viewerId],
  );
  return rows[0] ? toProfile(rows[0], viewerId) : null;
}

export async function profileById(userId: string, viewerId: string): Promise<Profile | null> {
  const { rows } = await getPool().query<ProfileRow>(`${PROFILE_SELECT} WHERE u.id = $1`, [
    userId,
    viewerId,
  ]);
  return rows[0] ? toProfile(rows[0], viewerId) : null;
}

export async function updateProfile(
  userId: string,
  fields: { handle?: string; displayName?: string; bio?: string },
): Promise<Profile | { error: string }> {
  if (fields.handle !== undefined) {
    const handle = fields.handle.trim().toLowerCase();
    const problem = handleProblem(handle);
    if (problem) return { error: problem };
    const { rowCount } = await getPool().query(
      "SELECT 1 FROM users WHERE lower(handle) = $1 AND id <> $2",
      [handle, userId],
    );
    if (rowCount) return { error: "Dieser Name ist schon vergeben." };
  }
  await getPool().query(
    `UPDATE users
        SET handle       = COALESCE($2, handle),
            display_name = COALESCE($3, display_name),
            bio          = COALESCE($4, bio)
      WHERE id = $1`,
    [
      userId,
      fields.handle?.trim().toLowerCase() ?? null,
      fields.displayName?.trim().slice(0, 60) ?? null,
      fields.bio?.trim().slice(0, 280) ?? null,
    ],
  );
  const profile = await profileById(userId, userId);
  return profile ?? { error: "Profil nicht gefunden." };
}

/** Vorschläge zum Entdecken: aktive Profile, denen man noch nicht folgt. */
export async function suggestedProfiles(viewerId: string, limit = 12): Promise<Profile[]> {
  const { rows } = await getPool().query<ProfileRow>(
    `${PROFILE_SELECT}
      WHERE u.id <> $2
        AND u.handle IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM follows f WHERE f.followee_id = u.id AND f.follower_id = $2)
      ORDER BY (SELECT count(*) FROM entries e WHERE e.user_id = u.id AND ${PUBLIC}) DESC,
               u.created_at DESC
      LIMIT $1`,
    [limit, viewerId],
  );
  return rows.map((row) => toProfile(row, viewerId));
}

export async function searchProfiles(query: string, viewerId: string, limit = 20): Promise<Profile[]> {
  const needle = `%${query.trim().toLowerCase()}%`;
  const { rows } = await getPool().query<ProfileRow>(
    `${PROFILE_SELECT}
      WHERE u.handle IS NOT NULL
        AND (lower(u.handle) LIKE $1 OR lower(coalesce(u.display_name, '')) LIKE $1)
      ORDER BY u.handle
      LIMIT $3`,
    [needle, viewerId, limit],
  );
  return rows.map((row) => toProfile(row, viewerId));
}

/* ── Feed ──────────────────────────────────────────────────── */

type FeedRow = {
  id: string;
  title: string | null;
  body: string | null;
  mood: number | null;
  tags: string[] | null;
  published_at: string;
  created_at: string;
  author_id: string;
  handle: string;
  display_name: string | null;
  like_count: string;
  comment_count: string;
  liked: boolean;
};

const FEED_SELECT = `
  SELECT e.id, e.title, e.body, e.mood, e.tags,
         (EXTRACT(EPOCH FROM e.published_at) * 1000)::bigint AS published_at,
         (EXTRACT(EPOCH FROM e.created_at) * 1000)::bigint   AS created_at,
         u.id AS author_id, u.handle, u.display_name,
         (SELECT count(*) FROM likes l WHERE l.entry_id = e.id)      AS like_count,
         (SELECT count(*) FROM comments c WHERE c.entry_id = e.id)   AS comment_count,
         EXISTS(SELECT 1 FROM likes l WHERE l.entry_id = e.id AND l.user_id = $1) AS liked
    FROM entries e
    JOIN users u ON u.id = e.user_id
   WHERE ${PUBLIC}
     AND e.published_at IS NOT NULL
`;

function toFeedItem(row: FeedRow, viewerId: string): FeedItem {
  return {
    id: row.id,
    author: {
      id: row.author_id,
      handle: row.handle,
      displayName: row.display_name || row.handle,
    },
    publishedAt: Number(row.published_at),
    createdAt: Number(row.created_at),
    title: row.title ?? "",
    body: row.body ?? "",
    mood: (row.mood as MoodValue | null) ?? null,
    tags: row.tags ?? [],
    likeCount: Number(row.like_count),
    commentCount: Number(row.comment_count),
    liked: row.liked,
    mine: row.author_id === viewerId,
  };
}

export type FeedScope = "following" | "discover" | "profile";

export async function readFeed(options: {
  viewerId: string;
  scope: FeedScope;
  handle?: string;
  before?: number | null;
  limit?: number;
}): Promise<FeedItem[]> {
  const { viewerId, scope, handle, before, limit = 20 } = options;
  const params: unknown[] = [viewerId];
  let where = "";

  if (scope === "following") {
    // Eigene Beiträge gehören dazu – sonst wirkt der eigene Feed leer,
    // solange man noch niemandem folgt.
    where += ` AND (e.user_id = $1 OR e.user_id IN (SELECT followee_id FROM follows WHERE follower_id = $1))`;
  } else if (scope === "profile") {
    params.push(handle);
    where += ` AND lower(u.handle) = lower($${params.length})`;
  }

  if (before) {
    params.push(before);
    where += ` AND e.published_at < to_timestamp($${params.length} / 1000.0)`;
  }

  params.push(limit);
  const { rows } = await getPool().query<FeedRow>(
    `${FEED_SELECT} ${where} ORDER BY e.published_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map((row) => toFeedItem(row, viewerId));
}

export async function readFeedItem(entryId: string, viewerId: string): Promise<FeedItem | null> {
  const { rows } = await getPool().query<FeedRow>(`${FEED_SELECT} AND e.id = $2`, [
    viewerId,
    entryId,
  ]);
  return rows[0] ? toFeedItem(rows[0], viewerId) : null;
}

/* ── Folgen ────────────────────────────────────────────────── */

export async function setFollow(
  followerId: string,
  followeeHandle: string,
  follow: boolean,
): Promise<Profile | null> {
  const { rows } = await getPool().query<{ id: string }>(
    "SELECT id FROM users WHERE lower(handle) = lower($1)",
    [followeeHandle],
  );
  const followee = rows[0];
  if (!followee || followee.id === followerId) return null;

  if (follow) {
    await getPool().query(
      `INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [followerId, followee.id],
    );
  } else {
    await getPool().query("DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2", [
      followerId,
      followee.id,
    ]);
  }
  return profileById(followee.id, followerId);
}

/* ── Herzen ────────────────────────────────────────────────── */

export async function setLike(
  userId: string,
  entryId: string,
  liked: boolean,
): Promise<{ likeCount: number; liked: boolean } | null> {
  // Nur öffentliche Einträge lassen sich mögen – sonst könnte man über die
  // Antwort die Existenz privater Einträge abfragen.
  const { rowCount } = await getPool().query(
    `SELECT 1 FROM entries e WHERE e.id = $1 AND ${PUBLIC}`,
    [entryId],
  );
  if (!rowCount) return null;

  if (liked) {
    await getPool().query(
      "INSERT INTO likes (entry_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [entryId, userId],
    );
  } else {
    await getPool().query("DELETE FROM likes WHERE entry_id = $1 AND user_id = $2", [
      entryId,
      userId,
    ]);
  }
  const { rows } = await getPool().query<{ count: string }>(
    "SELECT count(*) FROM likes WHERE entry_id = $1",
    [entryId],
  );
  return { likeCount: Number(rows[0]?.count ?? 0), liked };
}

/* ── Kommentare ────────────────────────────────────────────── */

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  handle: string;
  display_name: string | null;
};

function toComment(row: CommentRow, viewerId: string): Comment {
  return {
    id: row.id,
    author: {
      id: row.author_id,
      handle: row.handle,
      displayName: row.display_name || row.handle,
    },
    body: row.body,
    createdAt: Number(row.created_at),
    mine: row.author_id === viewerId,
  };
}

export async function readComments(entryId: string, viewerId: string): Promise<Comment[] | null> {
  const { rowCount } = await getPool().query(
    `SELECT 1 FROM entries e WHERE e.id = $1 AND ${PUBLIC}`,
    [entryId],
  );
  if (!rowCount) return null;

  const { rows } = await getPool().query<CommentRow>(
    `SELECT c.id, c.body,
            (EXTRACT(EPOCH FROM c.created_at) * 1000)::bigint AS created_at,
            u.id AS author_id, u.handle, u.display_name
       FROM comments c
       JOIN users u ON u.id = c.user_id
      WHERE c.entry_id = $1
      ORDER BY c.created_at`,
    [entryId],
  );
  return rows.map((row) => toComment(row, viewerId));
}

export async function writeComment(
  userId: string,
  entryId: string,
  body: string,
): Promise<Comment | null> {
  const text = body.trim().slice(0, 1000);
  if (!text) return null;
  const { rowCount } = await getPool().query(
    `SELECT 1 FROM entries e WHERE e.id = $1 AND ${PUBLIC}`,
    [entryId],
  );
  if (!rowCount) return null;

  const id = randomUUID();
  await getPool().query("INSERT INTO comments (id, entry_id, user_id, body) VALUES ($1, $2, $3, $4)", [
    id,
    entryId,
    userId,
    text,
  ]);
  const { rows } = await getPool().query<CommentRow>(
    `SELECT c.id, c.body,
            (EXTRACT(EPOCH FROM c.created_at) * 1000)::bigint AS created_at,
            u.id AS author_id, u.handle, u.display_name
       FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.id = $1`,
    [id],
  );
  return rows[0] ? toComment(rows[0], userId) : null;
}

/** Löschen darf, wer den Kommentar geschrieben hat – oder wem der Eintrag gehört. */
export async function deleteComment(userId: string, commentId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `DELETE FROM comments c
      USING entries e
      WHERE c.id = $1
        AND e.id = c.entry_id
        AND (c.user_id = $2 OR e.user_id = $2)`,
    [commentId, userId],
  );
  return Boolean(rowCount);
}

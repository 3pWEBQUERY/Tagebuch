import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "./db";
import type { AppNotification, Comment, FeedItem, MoodValue, NotificationKind, Profile } from "../types";

/**
 * Alles Öffentliche der App: Profile, Feed, Folgen, Herzen, Kommentare.
 *
 * Eine Regel zieht sich durch jede Abfrage: sichtbar ist ausschließlich, was
 * visibility = 'public' trägt und nicht gelöscht ist. Private Einträge tauchen
 * hier nirgends auf – auch nicht als Zahl in einer Statistik.
 */

const PUBLIC = "e.visibility = 'public' AND e.deleted_at IS NULL";

/**
 * Blockaden wirken in beide Richtungen: wer blockiert, sieht nichts mehr von
 * der Person – und wird von ihr auch nicht mehr gesehen. Ein einseitiges
 * Ausblenden würde die Blockade wertlos machen.
 */
function notBlocked(viewerParam: string, authorColumn: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM blocks b
     WHERE (b.blocker_id = ${viewerParam} AND b.blocked_id = ${authorColumn})
        OR (b.blocker_id = ${authorColumn} AND b.blocked_id = ${viewerParam})
  )`;
}

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
    `${PROFILE_SELECT} WHERE lower(u.handle) = lower($1) AND ${notBlocked("$2", "u.id")}`,
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
        AND ${notBlocked("$2", "u.id")}
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
        AND ${notBlocked("$2", "u.id")}
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
  photo_id: string | null;
  photo_width: number | null;
  photo_height: number | null;
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
         e.photo_id, p.width AS photo_width, p.height AS photo_height,
         (SELECT count(*) FROM likes l WHERE l.entry_id = e.id)      AS like_count,
         (SELECT count(*) FROM comments c WHERE c.entry_id = e.id)   AS comment_count,
         EXISTS(SELECT 1 FROM likes l WHERE l.entry_id = e.id AND l.user_id = $1) AS liked
    FROM entries e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN photos p ON p.id = e.photo_id
   WHERE ${PUBLIC}
     AND e.published_at IS NOT NULL
     AND ${notBlocked("$1", "e.user_id")}
`;

function toFeedItem(row: FeedRow, viewerId: string): FeedItem {
  return {
    id: row.id,
    author: {
      id: row.author_id,
      handle: row.handle,
      displayName: row.display_name || row.handle,
    },
    photo:
      row.photo_id && row.photo_width && row.photo_height
        ? { id: row.photo_id, width: row.photo_width, height: row.photo_height }
        : null,
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
    await notify({ recipientId: followee.id, actorId: followerId, kind: "follow" });
  } else {
    await getPool().query("DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2", [
      followerId,
      followee.id,
    ]);
  }
  return profileById(followee.id, followerId);
}

/**
 * Darf diese Person diesen Eintrag überhaupt sehen? Öffentlich reicht nicht –
 * über eine Blockade hinweg gibt es keinen Zugriff, auch nicht schreibend.
 * Sonst könnte eine blockierte Person weiter Herzen und Kommentare hinterlassen.
 */
async function entryVisibleTo(entryId: string, viewerId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `SELECT 1 FROM entries e
      WHERE e.id = $1 AND ${PUBLIC} AND ${notBlocked("$2", "e.user_id")}`,
    [entryId, viewerId],
  );
  return Boolean(rowCount);
}

/* ── Herzen ────────────────────────────────────────────────── */

export async function setLike(
  userId: string,
  entryId: string,
  liked: boolean,
): Promise<{ likeCount: number; liked: boolean } | null> {
  // Nur öffentliche, nicht blockierte Einträge lassen sich mögen – sonst
  // ließe sich über die Antwort die Existenz privater Einträge abfragen.
  if (!(await entryVisibleTo(entryId, userId))) return null;

  if (liked) {
    await getPool().query(
      "INSERT INTO likes (entry_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [entryId, userId],
    );
    const { rows: owner } = await getPool().query<{ user_id: string }>(
      "SELECT user_id FROM entries WHERE id = $1",
      [entryId],
    );
    if (owner[0]) {
      await notify({ recipientId: owner[0].user_id, actorId: userId, kind: "like", entryId });
    }
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
  if (!(await entryVisibleTo(entryId, viewerId))) return null;

  const { rows } = await getPool().query<CommentRow>(
    `SELECT c.id, c.body,
            (EXTRACT(EPOCH FROM c.created_at) * 1000)::bigint AS created_at,
            u.id AS author_id, u.handle, u.display_name
       FROM comments c
       JOIN users u ON u.id = c.user_id
      WHERE c.entry_id = $1
        AND ${notBlocked("$2", "c.user_id")}
      ORDER BY c.created_at`,
    [entryId, viewerId],
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
  if (!(await entryVisibleTo(entryId, userId))) return null;

  const id = randomUUID();
  await getPool().query("INSERT INTO comments (id, entry_id, user_id, body) VALUES ($1, $2, $3, $4)", [
    id,
    entryId,
    userId,
    text,
  ]);
  const { rows: owner } = await getPool().query<{ user_id: string }>(
    "SELECT user_id FROM entries WHERE id = $1",
    [entryId],
  );
  if (owner[0]) {
    await notify({ recipientId: owner[0].user_id, actorId: userId, kind: "comment", entryId });
  }
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

/* ── Benachrichtigungen ────────────────────────────────────── */

/**
 * Wird bei Herz, Kommentar und Folgen geschrieben – nie für eigene Handlungen
 * und nie über eine Blockade hinweg. Doppelte Herzen erzeugen keine zweite
 * Nachricht: ein Klick hin und her würde sonst die Liste fluten.
 */
async function notify(options: {
  recipientId: string;
  actorId: string;
  kind: NotificationKind;
  entryId?: string | null;
}): Promise<void> {
  const { recipientId, actorId, kind, entryId = null } = options;
  if (recipientId === actorId) return;

  const { rowCount: blocked } = await getPool().query(
    `SELECT 1 FROM blocks
      WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [recipientId, actorId],
  );
  if (blocked) return;

  if (kind !== "comment") {
    const { rowCount: exists } = await getPool().query(
      `SELECT 1 FROM notifications
        WHERE user_id = $1 AND actor_id = $2 AND kind = $3
          AND entry_id IS NOT DISTINCT FROM $4`,
      [recipientId, actorId, kind, entryId],
    );
    if (exists) return;
  }

  await getPool().query(
    "INSERT INTO notifications (id, user_id, actor_id, kind, entry_id) VALUES ($1, $2, $3, $4, $5)",
    [randomUUID(), recipientId, actorId, kind, entryId],
  );
}

type NotificationRow = {
  id: string;
  kind: NotificationKind;
  entry_id: string | null;
  entry_title: string | null;
  entry_body: string | null;
  created_at: string;
  read_at: string | null;
  actor_id: string;
  handle: string;
  display_name: string | null;
};

export async function readNotifications(
  userId: string,
  limit = 40,
): Promise<{ items: AppNotification[]; unread: number }> {
  const { rows } = await getPool().query<NotificationRow>(
    `SELECT n.id, n.kind, n.entry_id,
            e.title AS entry_title, e.body AS entry_body,
            (EXTRACT(EPOCH FROM n.created_at) * 1000)::bigint AS created_at,
            n.read_at, u.id AS actor_id, u.handle, u.display_name
       FROM notifications n
       JOIN users u ON u.id = n.actor_id
       LEFT JOIN entries e ON e.id = n.entry_id
      WHERE n.user_id = $1
        AND ${notBlocked("$1", "n.actor_id")}
      ORDER BY n.created_at DESC
      LIMIT $2`,
    [userId, limit],
  );

  const items = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    actor: {
      id: row.actor_id,
      handle: row.handle,
      displayName: row.display_name || row.handle,
    },
    entryId: row.entry_id,
    entryTitle: (row.entry_title || row.entry_body || "").trim().slice(0, 60) || null,
    createdAt: Number(row.created_at),
    read: row.read_at !== null,
  }));
  return { items, unread: items.filter((i) => !i.read).length };
}

export async function markNotificationsRead(userId: string): Promise<void> {
  await getPool().query(
    "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL",
    [userId],
  );
}

/* ── Blockieren ────────────────────────────────────────────── */

/**
 * Blockieren löst bestehende Verbindungen in beide Richtungen: sonst bliebe
 * die Person weiter Follower und bekäme jede neue Veröffentlichung.
 */
export async function setBlock(
  userId: string,
  handle: string,
  blocked: boolean,
): Promise<{ blocked: boolean } | null> {
  const { rows } = await getPool().query<{ id: string }>(
    "SELECT id FROM users WHERE lower(handle) = lower($1)",
    [handle],
  );
  const target = rows[0];
  if (!target || target.id === userId) return null;

  if (blocked) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, target.id],
      );
      await client.query(
        `DELETE FROM follows
          WHERE (follower_id = $1 AND followee_id = $2)
             OR (follower_id = $2 AND followee_id = $1)`,
        [userId, target.id],
      );
      await client.query(
        `DELETE FROM notifications
          WHERE (user_id = $1 AND actor_id = $2) OR (user_id = $2 AND actor_id = $1)`,
        [userId, target.id],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } else {
    await getPool().query("DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2", [
      userId,
      target.id,
    ]);
  }
  return { blocked };
}

export async function blockedProfiles(userId: string): Promise<{ handle: string; displayName: string }[]> {
  const { rows } = await getPool().query<{ handle: string; display_name: string | null }>(
    `SELECT u.handle, u.display_name
       FROM blocks b JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = $1
      ORDER BY u.handle`,
    [userId],
  );
  return rows.map((r) => ({ handle: r.handle, displayName: r.display_name || r.handle }));
}

/* ── Melden ────────────────────────────────────────────────── */

/**
 * Meldungen landen in der Datenbank, damit sie nachlesbar sind. Automatisch
 * gelöscht wird nichts – wer meldet, soll blockieren können, ohne auf eine
 * Entscheidung zu warten.
 */
export async function createReport(options: {
  reporterId: string;
  handle?: string | null;
  entryId?: string | null;
  commentId?: string | null;
  reason: string;
  note?: string;
}): Promise<boolean> {
  const { reporterId, handle, entryId = null, commentId = null, reason, note = "" } = options;
  let targetUserId: string | null = null;
  if (handle) {
    const { rows } = await getPool().query<{ id: string }>(
      "SELECT id FROM users WHERE lower(handle) = lower($1)",
      [handle],
    );
    targetUserId = rows[0]?.id ?? null;
  }
  if (!targetUserId && !entryId && !commentId) return false;

  await getPool().query(
    `INSERT INTO reports (id, reporter_id, target_user_id, entry_id, comment_id, reason, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), reporterId, targetUserId, entryId, commentId, reason.slice(0, 40), note.slice(0, 1000)],
  );
  return true;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { fullDate, relativeTime, time } from "@/lib/format";
import * as social from "@/lib/social";
import { moodOf, type Comment, type FeedItem } from "@/lib/types";
import { Avatar } from "./Avatar";
import { IconClose, IconHeart, IconSend, IconTrash } from "./icons";

/**
 * Ein Beitrag in ganzer Länge samt Kommentaren. Anders als der Editor ist das
 * eine Lese-Ansicht: fremde Gedanken bearbeitet man nicht.
 */
export function PostSheet({
  item,
  onClose,
  onOpenProfile,
  onChanged,
}: {
  item: FeedItem;
  onClose: () => void;
  onOpenProfile: (handle: string) => void;
  onChanged: (item: FeedItem) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [post, setPost] = useState(item);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
    social
      .fetchComments(item.id)
      .then(({ comments: list }) => setComments(list))
      .catch(() => setComments([]));
  }, [item.id]);

  function requestClose() {
    setClosing(true);
    window.setTimeout(() => {
      dialogRef.current?.close();
      onClose();
    }, 180);
  }

  async function toggleLike() {
    const next = !post.liked;
    const optimistic = { ...post, liked: next, likeCount: post.likeCount + (next ? 1 : -1) };
    setPost(optimistic);
    onChanged(optimistic);
    try {
      const result = await social.setLike(post.id, next);
      const updated = { ...post, ...result };
      setPost(updated);
      onChanged(updated);
    } catch {
      setPost(post);
      onChanged(post);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { comment } = await social.postComment(post.id, text);
      setComments((list) => [...(list ?? []), comment]);
      setDraft("");
      const updated = { ...post, commentCount: post.commentCount + 1 };
      setPost(updated);
      onChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kommentar nicht gespeichert");
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(comment: Comment) {
    setComments((list) => (list ?? []).filter((c) => c.id !== comment.id));
    const updated = { ...post, commentCount: Math.max(0, post.commentCount - 1) };
    setPost(updated);
    onChanged(updated);
    try {
      await social.deleteComment(comment.id);
    } catch {
      setComments((list) => [...(list ?? []), comment].sort((a, b) => a.createdAt - b.createdAt));
    }
  }

  const mood = moodOf(post.mood);

  return (
    <dialog
      ref={dialogRef}
      className={`sheet${closing ? " sheetClosing" : ""}`}
      aria-label="Beitrag"
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) requestClose();
      }}
    >
      <div className="sheetForm">
        <header className="sheetHead">
          <button className="btn btnGhost" type="button" onClick={requestClose}>
            Zurück
          </button>
          <h2 className="sheetTitle">Beitrag</h2>
          <span style={{ minWidth: 62 }} />
        </header>

        <div className="sheetBody postSheetBody">
          <button
            className="postAuthor postAuthorLarge"
            type="button"
            onClick={() => {
              requestClose();
              onOpenProfile(post.author.handle);
            }}
          >
            <Avatar handle={post.author.handle} name={post.author.displayName} size={44} />
            <span className="postAuthorText">
              <span className="postName">{post.author.displayName}</span>
              <span className="postHandle">
                @{post.author.handle} · {relativeTime(post.publishedAt)}
              </span>
            </span>
          </button>

          {mood && (
            <div
              className="postHero postHeroSheet"
              style={{ ["--mood" as string]: mood.color } as React.CSSProperties}
            >
              <span className="postFace">{mood.face}</span>
              <span className="postMood">{mood.label}</span>
            </div>
          )}

          {post.title.trim() && <h3 className="postSheetTitle">{post.title}</h3>}
          <p className="postSheetText">{post.body}</p>

          {post.tags.length > 0 && (
            <p className="postTags">
              {post.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </p>
          )}

          <p className="postStamp">
            Geschrieben am {fullDate(post.createdAt)} um {time(post.createdAt)} Uhr
          </p>

          <div className="postActions postActionsSheet">
            <button
              className={`postAction${post.liked ? " postActionOn" : ""}`}
              type="button"
              aria-pressed={post.liked}
              onClick={() => void toggleLike()}
            >
              <IconHeart />
              <span>
                {post.likeCount > 0
                  ? `${post.likeCount} ${post.likeCount === 1 ? "Herz" : "Herzen"}`
                  : "Gefällt mir"}
              </span>
            </button>
          </div>

          <section className="comments" aria-label="Kommentare">
            <h3 className="commentsTitle">
              {post.commentCount === 1 ? "1 Kommentar" : `${post.commentCount} Kommentare`}
            </h3>

            {comments === null && <p className="commentsHint">Kommentare werden geladen …</p>}
            {comments?.length === 0 && (
              <p className="commentsHint">Noch nichts gesagt. Sei die erste Stimme.</p>
            )}

            {comments?.map((comment) => (
              <article className="comment" key={comment.id}>
                <button
                  className="commentAvatar"
                  type="button"
                  aria-label={`Profil von ${comment.author.displayName}`}
                  onClick={() => {
                    requestClose();
                    onOpenProfile(comment.author.handle);
                  }}
                >
                  <Avatar handle={comment.author.handle} name={comment.author.displayName} size={32} />
                </button>
                <div className="commentBody">
                  <p className="commentMeta">
                    <span className="commentName">{comment.author.displayName}</span>
                    <span className="commentTime">{relativeTime(comment.createdAt)}</span>
                  </p>
                  <p className="commentText">{comment.body}</p>
                </div>
                {(comment.mine || post.mine) && (
                  <button
                    className="iconBtn iconBtnDanger commentDelete"
                    type="button"
                    aria-label="Kommentar löschen"
                    onClick={() => void removeComment(comment)}
                  >
                    <IconTrash />
                  </button>
                )}
              </article>
            ))}
          </section>
        </div>

        <form className="commentForm" onSubmit={submit}>
          <input
            className="commentInput"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Etwas Freundliches schreiben …"
            aria-label="Kommentar"
            maxLength={1000}
            disabled={busy}
          />
          <button
            className="iconBtn commentSend"
            type="submit"
            aria-label="Kommentar senden"
            disabled={busy || !draft.trim()}
          >
            <IconSend />
          </button>
          {error && (
            <p className="commentError" role="alert">
              <IconClose /> {error}
            </p>
          )}
        </form>
      </div>
    </dialog>
  );
}

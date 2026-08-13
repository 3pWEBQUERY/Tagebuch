"use client";

import { memo } from "react";
import { relativeTime } from "@/lib/format";
import { photoUrl } from "@/lib/photo";
import { moodOf, type FeedItem } from "@/lib/types";
import { Avatar } from "./Avatar";
import { IconComment, IconHeart, IconMore } from "./icons";

/**
 * Die Karte im Feed. Ein Tagebucheintrag hat kein Foto – den visuellen Platz
 * übernimmt die Stimmung: eine Fläche in ihrer Farbe. Wo keine Stimmung
 * gewählt wurde, trägt der erste Satz die Karte, gesetzt wie ein Zitat.
 */

function firstSentence(text: string): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return sentence.length > 120 ? `${sentence.slice(0, 117)}…` : sentence;
}

/**
 * Was die Karte zeigt, hängt daran, was die Fläche oben schon trägt:
 * Bei gesetzter Stimmung steht dort das Gesicht – dann gehört der Text
 * vollständig darunter. Ohne Stimmung trägt der Anfang die Fläche und darf
 * unten nicht ein zweites Mal stehen.
 */
function layout(item: FeedItem, hasMood: boolean) {
  const title = item.title.trim();
  const body = item.body.trim();
  if (hasMood) return { hero: null, title, text: body };

  const hero = title || firstSentence(body);
  const text = title || !body.startsWith(hero) ? body : body.slice(hero.length).trim();
  return { hero, title: "", text };
}

type Props = {
  item: FeedItem;
  onOpen: (item: FeedItem) => void;
  onAuthor: (handle: string) => void;
  onLike: (item: FeedItem) => void;
  onMenu: (item: FeedItem) => void;
};

function PostCardBase({ item, onOpen, onAuthor, onLike, onMenu }: Props) {
  const mood = moodOf(item.mood);
  // Gibt es ein Bild, trägt es die Karte – die Stimmung wird zur Plakette darauf.
  const { hero, title, text } = layout(item, mood !== null || item.photo !== null);

  return (
    <article className="post glass">
      <header className="postHead">
        <button className="postAuthor" type="button" onClick={() => onAuthor(item.author.handle)}>
          <Avatar handle={item.author.handle} name={item.author.displayName} size={40} />
          <span className="postAuthorText">
            <span className="postName">{item.author.displayName}</span>
            <span className="postHandle">@{item.author.handle}</span>
          </span>
        </button>
        <time className="postTime" dateTime={new Date(item.publishedAt).toISOString()}>
          {relativeTime(item.publishedAt)}
        </time>
        {!item.mine && (
          <button
            className="iconBtn postMenu"
            type="button"
            aria-label="Mehr zu diesem Beitrag"
            onClick={() => onMenu(item)}
          >
            <IconMore />
          </button>
        )}
      </header>

      <button
        className={`postHero${item.photo ? " postHeroPhoto" : mood ? "" : " postHeroQuiet"}`}
        type="button"
        onClick={() => onOpen(item)}
        style={mood ? ({ ["--mood" as string]: mood.color } as React.CSSProperties) : undefined}
        aria-label="Eintrag öffnen"
      >
        {item.photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="postPhoto"
              src={photoUrl(item.photo.id)}
              alt=""
              width={item.photo.width}
              height={item.photo.height}
              loading="lazy"
              decoding="async"
              style={{ aspectRatio: `${item.photo.width} / ${item.photo.height}` }}
            />
            {mood && (
              <span className="moodBadge" title={mood.label}>
                <span aria-hidden="true">{mood.face}</span>
                <span className="sr-only">Stimmung: {mood.label}</span>
              </span>
            )}
          </>
        ) : mood ? (
          <>
            <span className="postFace">{mood.face}</span>
            <span className="postMood">{mood.label}</span>
          </>
        ) : (
          <span className="postOpener">{hero}</span>
        )}
      </button>

      <div className="postBody">
        {title && <h3 className="postTitle">{title}</h3>}
        {text && <p className="postText">{text}</p>}

        {item.tags.length > 0 && (
          <p className="postTags">
            {item.tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </p>
        )}
      </div>

      <footer className="postActions">
        <button
          className={`postAction${item.liked ? " postActionOn" : ""}`}
          type="button"
          aria-pressed={item.liked}
          onClick={() => onLike(item)}
        >
          <IconHeart />
          <span>{item.likeCount > 0 ? item.likeCount : "Gefällt mir"}</span>
        </button>
        <button className="postAction" type="button" onClick={() => onOpen(item)}>
          <IconComment />
          <span>
            {item.commentCount > 0
              ? `${item.commentCount} ${item.commentCount === 1 ? "Kommentar" : "Kommentare"}`
              : "Kommentieren"}
          </span>
        </button>
      </footer>
    </article>
  );
}

export const PostCard = memo(PostCardBase);

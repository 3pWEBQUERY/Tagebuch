"use client";

import { memo } from "react";
import { relativeTime } from "@/lib/format";
import { moodOf, type FeedItem } from "@/lib/types";
import { Avatar } from "./Avatar";
import { IconComment, IconHeart } from "./icons";

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
};

function PostCardBase({ item, onOpen, onAuthor, onLike }: Props) {
  const mood = moodOf(item.mood);
  const { hero, title, text } = layout(item, mood !== null);

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
      </header>

      <button
        className={`postHero${mood ? "" : " postHeroQuiet"}`}
        type="button"
        onClick={() => onOpen(item)}
        style={mood ? ({ ["--mood" as string]: mood.color } as React.CSSProperties) : undefined}
        aria-label="Eintrag öffnen"
      >
        {mood ? (
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

"use client";

import { useMemo } from "react";
import { countWords, dayKey, streakOf } from "@/lib/format";
import { useStore } from "@/lib/store";
import { MOODS } from "@/lib/types";
import { MoodChart } from "./MoodChart";

export function InsightsView() {
  const { entries } = useStore();

  const data = useMemo(() => {
    const words = entries.reduce((sum, e) => sum + countWords(`${e.title} ${e.body}`), 0);
    const days = new Set(entries.map((e) => dayKey(e.createdAt))).size;
    const withMood = entries.filter((e) => e.mood !== null);
    const avg = withMood.length
      ? withMood.reduce((sum, e) => sum + (e.mood ?? 0), 0) / withMood.length
      : null;

    const counts = new Map<number, number>();
    withMood.forEach((e) => counts.set(e.mood!, (counts.get(e.mood!) ?? 0) + 1));

    const tagCounts = new Map<string, number>();
    entries.forEach((e) => e.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

    return {
      words,
      days,
      avg,
      counts,
      moodTotal: withMood.length,
      topTags,
      streak: streakOf(entries.map((e) => e.createdAt)),
    };
  }, [entries]);

  const maxCount = Math.max(1, ...[...data.counts.values()]);

  return (
    <section className="view" id="view-insights" aria-labelledby="insights-heading">
      <div className="wrap">
        <div className="hero">
          <p className="heroKicker">Rückblick</p>
          <h1 className="heroTitle" id="insights-heading">
            Verlauf
          </h1>
          <p className="heroSub">
            {entries.length
              ? "Muster erkennt man selten im Moment – hier siehst du sie über die Zeit."
              : "Sobald du schreibst, entsteht hier dein Verlauf."}
          </p>
        </div>

        <div className="stats">
          <div className="stat glass">
            <div className="statValue">{data.streak}</div>
            <div className="statLabel">{data.streak === 1 ? "Tag in Folge" : "Tage in Folge"}</div>
          </div>
          <div className="stat glass">
            <div className="statValue">{entries.length}</div>
            <div className="statLabel">{entries.length === 1 ? "Eintrag" : "Einträge"}</div>
          </div>
          <div className="stat glass">
            <div className="statValue">{data.words.toLocaleString("de-DE")}</div>
            <div className="statLabel">Wörter</div>
          </div>
          <div className="stat glass">
            <div className="statValue">
              {data.avg === null ? "–" : data.avg.toFixed(1).replace(".", ",")}
            </div>
            <div className="statLabel">Ø Stimmung</div>
          </div>
        </div>

        <section className="card glass" aria-labelledby="chart-h">
          <div className="cardHead">
            <h2 className="cardTitle" id="chart-h">
              Stimmung
            </h2>
            <span className="cardMeta">letzte 30 Tage</span>
          </div>
          <MoodChart entries={entries} />
        </section>

        <section className="card glass" aria-labelledby="dist-h">
          <div className="cardHead">
            <h2 className="cardTitle" id="dist-h">
              Verteilung
            </h2>
            <span className="cardMeta">
              {data.moodTotal ? `${data.moodTotal} bewertet` : "noch nichts bewertet"}
            </span>
          </div>
          <div className="dist">
            {MOODS.map((m, i) => {
              const n = data.counts.get(m.value) ?? 0;
              return (
                <div className="distRow" key={m.value} style={{ ["--mood" as string]: m.color } as React.CSSProperties}>
                  <span className="distEmoji" title={m.label}>
                    {m.face}
                  </span>
                  <span className="distTrack">
                    <span
                      className="distBar"
                      style={{ width: `${(n / maxCount) * 100}%`, animationDelay: `${i * 60}ms` }}
                    />
                  </span>
                  <span className="distN">{n}</span>
                  <span className="sr-only">
                    {m.label}: {n}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card glass" aria-labelledby="tags-h">
          <div className="cardHead">
            <h2 className="cardTitle" id="tags-h">
              Häufige Themen
            </h2>
            <span className="cardMeta">{data.days ? `an ${data.days} Tagen geschrieben` : ""}</span>
          </div>
          {data.topTags.length ? (
            <div className="tagcloud">
              {data.topTags.map(([tag, n]) => (
                <span className="tag" key={tag}>
                  {tag}
                  <b>{n}</b>
                </span>
              ))}
            </div>
          ) : (
            <p className="cardText" style={{ margin: 0 }}>
              Themen wie „Arbeit“, „Familie“ oder „Schlaf“ helfen dir später, Zusammenhänge zu sehen.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { dayKey, shortDate } from "@/lib/format";
import type { Entry } from "@/lib/types";

const W = 700;
const H = 210;
const PAD_X = 26;
const PAD_Y = 22;
const DAYS = 30;

type Point = { x: number; y: number; day: number; value: number };

/** Catmull-Rom → kubische Bézier: weiche Kurve ohne Überschwingen an den Enden. */
function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function MoodChart({ entries }: { entries: Entry[] }) {
  const gradientId = useId().replace(/:/g, "");
  const pathRef = useRef<SVGPathElement>(null);

  const { points, firstLabel, lastLabel } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = today.getTime() - (DAYS - 1) * 86_400_000;

    const buckets = new Map<string, number[]>();
    entries.forEach((e) => {
      if (e.mood === null || e.createdAt < start) return;
      const key = dayKey(e.createdAt);
      const list = buckets.get(key);
      if (list) list.push(e.mood);
      else buckets.set(key, [e.mood]);
    });

    const pts: Point[] = [];
    for (let i = 0; i < DAYS; i++) {
      const ts = start + i * 86_400_000;
      const values = buckets.get(dayKey(ts));
      if (!values?.length) continue;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      pts.push({
        x: PAD_X + (i * (W - 2 * PAD_X)) / (DAYS - 1),
        y: PAD_Y + ((5 - avg) / 4) * (H - 2 * PAD_Y),
        day: ts,
        value: avg,
      });
    }
    return {
      points: pts,
      firstLabel: shortDate(start),
      lastLabel: shortDate(today.getTime()),
    };
  }, [entries]);

  // Ziehlänge für die Zeichenanimation erst im Browser messen.
  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    path.style.setProperty("--len", `${Math.ceil(path.getTotalLength())}`);
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="chart">
        <p className="chartEmpty">
          Noch keine Stimmung erfasst. Wähle beim Schreiben ein Gesicht – dann entsteht hier deine Kurve.
        </p>
      </div>
    );
  }

  const line = smoothPath(points);
  const area =
    points.length > 1
      ? `${line} L${points[points.length - 1].x.toFixed(1)} ${H - PAD_Y} L${points[0].x.toFixed(1)} ${H - PAD_Y} Z`
      : "";

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Stimmungsverlauf der letzten 30 Tage">
        <defs>
          <linearGradient id={`area-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map((i) => {
          const y = PAD_Y + (i * (H - 2 * PAD_Y)) / 4;
          return <line key={i} className="chartGrid" x1={PAD_X} y1={y} x2={W - PAD_X} y2={y} />;
        })}

        {area && <path className="chartArea" d={area} fill={`url(#area-${gradientId})`} stroke="none" />}
        <path ref={pathRef} className="chartLine" d={line} />

        {points.map((p) => (
          <circle key={p.day} className="chartDot" cx={p.x} cy={p.y} r={points.length > 18 ? 3 : 4.5}>
            <title>{`${shortDate(p.day)}: ${p.value.toFixed(1)} von 5`}</title>
          </circle>
        ))}

        <text className="chartAxis" x={PAD_X} y={H - 4}>
          {firstLabel}
        </text>
        <text className="chartAxis" x={W - PAD_X} y={H - 4} textAnchor="end">
          {lastLabel}
        </text>
      </svg>
    </div>
  );
}

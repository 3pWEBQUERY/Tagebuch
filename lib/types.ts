export type MoodValue = 1 | 2 | 3 | 4 | 5;

export type Entry = {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  body: string;
  mood: MoodValue | null;
  tags: string[];
  favorite: boolean;
};

export type Mood = {
  value: MoodValue;
  face: string;
  label: string;
  /** CSS-Custom-Property, die im Theme hell/dunkel unterschiedlich aufgelöst wird. */
  color: string;
};

export const MOODS: Mood[] = [
  { value: 1, face: "😔", label: "Schwer", color: "var(--m1)" },
  { value: 2, face: "😕", label: "Gedämpft", color: "var(--m2)" },
  { value: 3, face: "😐", label: "Neutral", color: "var(--m3)" },
  { value: 4, face: "🙂", label: "Gut", color: "var(--m4)" },
  { value: 5, face: "😄", label: "Großartig", color: "var(--m5)" },
];

export function moodOf(value: MoodValue | null): Mood | null {
  return value ? MOODS.find((m) => m.value === value) ?? null : null;
}

export type ThemePref = "light" | "dark" | "system";

export type Accent = { id: string; name: string; hex: string };

export const ACCENTS: Accent[] = [
  { id: "violet", name: "Violett", hex: "#6c5ce7" },
  { id: "blue", name: "Blau", hex: "#2f7ff6" },
  { id: "teal", name: "Türkis", hex: "#12a5a5" },
  { id: "green", name: "Grün", hex: "#2fa96a" },
  { id: "rose", name: "Rosé", hex: "#e2557f" },
  { id: "amber", name: "Bernstein", hex: "#d98324" },
];

export function isEntry(value: unknown): value is Entry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.createdAt === "number" &&
    typeof e.body === "string" &&
    Array.isArray(e.tags)
  );
}

/** Nimmt beliebiges JSON aus einem Import entgegen und formt daraus einen sauberen Eintrag. */
export function normalizeEntry(raw: unknown): Entry | null {
  if (!isEntry(raw)) return null;
  const e = raw as Entry;
  const mood = typeof e.mood === "number" && e.mood >= 1 && e.mood <= 5 ? (Math.round(e.mood) as MoodValue) : null;
  return {
    id: e.id,
    createdAt: e.createdAt,
    updatedAt: typeof e.updatedAt === "number" ? e.updatedAt : e.createdAt,
    title: typeof e.title === "string" ? e.title.slice(0, 200) : "",
    body: e.body,
    mood,
    tags: e.tags.filter((t): t is string => typeof t === "string").slice(0, 24),
    favorite: e.favorite === true,
  };
}

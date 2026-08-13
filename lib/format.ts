const LOCALE = "de-DE";

const fmtTime = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });
const fmtWeekday = new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" });
const fmtFull = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const fmtStamp = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const fmtShort = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" });

export const time = (ts: number) => fmtTime.format(ts);
export const fullDate = (ts: number) => fmtFull.format(ts);
/** Ohne Jahr – für den Kopfbereich, der ohnehin „heute“ meint. */
export const weekdayDate = (ts: number) => fmtWeekday.format(ts);
export const stamp = (ts: number) => `${fmtStamp.format(ts)} Uhr`;
export const shortDate = (ts: number) => fmtShort.format(ts);

/** Lokaler Tagesschlüssel (nicht UTC – sonst springt die Gruppierung nachts). */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayLabel(ts: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(ts)) / 86_400_000);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Gestern";
  if (diff < 7 && diff > 0) return fmtWeekday.format(ts);
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return sameYear ? fmtWeekday.format(ts) : fmtFull.format(ts);
}

const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto", style: "long" });

/** „gerade eben“, „vor 3 Std.“, „vor 2 Tagen“ – ab einer Woche das Datum. */
export function relativeTime(ts: number, now = Date.now()): string {
  const seconds = Math.round((ts - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "gerade eben";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 604_800) return rtf.format(Math.round(seconds / 86_400), "day");
  return shortDate(ts);
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Gute Nacht";
  if (h < 11) return "Guten Morgen";
  if (h < 14) return "Guten Tag";
  if (h < 18) return "Guten Nachmittag";
  return "Guten Abend";
}

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Aufeinanderfolgende Tage mit Eintrag, von heute (oder gestern) rückwärts. */
export function streakOf(timestamps: number[], now = Date.now()): number {
  if (!timestamps.length) return 0;
  const days = new Set(timestamps.map(dayKey));
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor.getTime()))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

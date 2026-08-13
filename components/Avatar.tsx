"use client";

/**
 * Kein Datei-Upload, sondern ein Bild aus dem Handle: gleicher Name, gleiche
 * Farben – dauerhaft wiedererkennbar, ohne Speicher und ohne Platzhalter,
 * die nach fehlendem Foto aussehen.
 */

function hashOf(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function avatarColors(handle: string): { from: string; to: string } {
  const hash = hashOf(handle || "?");
  const hue = hash % 360;
  // Zweiter Ton im Abstand eines Sechstels des Kreises: harmonisch, nie grell.
  return {
    from: `oklch(0.72 0.15 ${hue})`,
    to: `oklch(0.6 0.16 ${(hue + 58) % 360})`,
  };
}

function initials(name: string, handle: string): string {
  const source = (name || handle || "?").trim();
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

type Props = {
  handle: string;
  name?: string;
  size?: number;
  className?: string;
};

export function Avatar({ handle, name = "", size = 40, className = "" }: Props) {
  const { from, to } = avatarColors(handle);
  return (
    <span
      className={`avatar ${className}`.trim()}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * 0.36)),
        backgroundImage: `linear-gradient(145deg, ${from}, ${to})`,
      }}
      aria-hidden="true"
    >
      {initials(name, handle)}
    </span>
  );
}

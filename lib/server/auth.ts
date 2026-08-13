import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Zugangsschutz mit einer einzigen Passphrase (APP_PASSWORD).
 *
 * Kein Konto, keine Nutzertabelle – das Tagebuch gehört einer Person. Die
 * Sitzung ist ein signiertes Cookie, der Server merkt sich nichts. Ist
 * APP_PASSWORD nicht gesetzt, läuft alles offen; das ist für die lokale
 * Entwicklung bequem und wird in der Oberfläche deutlich angezeigt.
 */

const COOKIE = "tb_session";
const MAX_AGE = 60 * 60 * 24 * 365; // ein Jahr

export function authRequired(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

function key(): Buffer {
  return createHash("sha256").update(process.env.APP_PASSWORD ?? "").digest();
}

function sign(expiry: number): string {
  return createHmac("sha256", key()).update(String(expiry)).digest("base64url");
}

function equal(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function checkPassword(candidate: unknown): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected || typeof candidate !== "string") return false;
  // Auf gleiche Länge hashen, damit der Vergleich nichts über die Länge verrät.
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function isAuthenticated(): Promise<boolean> {
  if (!authRequired()) return true;
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  const [rawExpiry, signature] = token.split(".");
  const expiry = Number(rawExpiry);
  if (!Number.isFinite(expiry) || expiry < Date.now() || !signature) return false;
  return equal(signature, sign(expiry));
}

export async function startSession(): Promise<void> {
  const expiry = Date.now() + MAX_AGE * 1000;
  (await cookies()).set(COOKIE, `${expiry}.${sign(expiry)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/**
 * Grobe Bremse gegen Durchprobieren. Pro Prozess im Speicher – reicht für eine
 * App mit einer Nutzerin und kostet keine weitere Infrastruktur.
 */
const attempts = new Map<string, { count: number; until: number }>();
const WINDOW = 60_000;
const LIMIT = 8;

export function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.until < now) {
    attempts.set(ip, { count: 1, until: now + WINDOW });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

export function clearAttempts(ip: string): void {
  attempts.delete(ip);
}

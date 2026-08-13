import "server-only";

import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getPool } from "./db";

/**
 * Konten mit E-Mail und Passwort.
 *
 * Gehasht wird mit scrypt aus der Node-Standardbibliothek – kein zusätzliches
 * Paket, kein natives Build-Artefakt beim Deployment. Die Sitzung ist ein
 * signiertes Cookie mit der Konto-id; der Server hält keinen Zustand.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const COOKIE = "tb_session";
const MAX_AGE = 60 * 60 * 24 * 365; // ein Jahr
const PARAMS = { N: 16384, r: 8, p: 1 };

export type User = { id: string; email: string };

/* ── Signaturschlüssel ─────────────────────────────────────── */

let ephemeralSecret: string | null = null;

function secret(): string {
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv) return fromEnv;
  // Ohne gesetzten Schlüssel bleibt die App benutzbar, aber jede Neustart-
  // Runde wirft alle Sitzungen weg. In der Produktion ist das ein Fehler.
  if (!ephemeralSecret) {
    ephemeralSecret = randomBytes(32).toString("hex");
    console.warn(
      "[auth] AUTH_SECRET ist nicht gesetzt – Sitzungen überleben keinen Neustart.",
    );
  }
  return ephemeralSecret;
}

/* ── Passwörter ────────────────────────────────────────────── */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), hash.toString("base64")].join(
    "$",
  );
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ── Konten ────────────────────────────────────────────────── */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 160 && EMAIL.test(email) ? email : null;
}

export function passwordProblem(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8) {
    return "Das Passwort braucht mindestens 8 Zeichen.";
  }
  if (value.length > 200) return "Das Passwort ist zu lang.";
  return null;
}

export async function createUser(email: string, password: string): Promise<User | "exists"> {
  const id = randomUUID();
  const hash = await hashPassword(password);
  const { rowCount } = await getPool().query(
    `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING`,
    [id, email, hash],
  );
  return rowCount === 0 ? "exists" : { id, email };
}

export async function findUser(email: string, password: string): Promise<User | null> {
  const { rows } = await getPool().query<{ id: string; email: string; password_hash: string }>(
    "SELECT id, email, password_hash FROM users WHERE email = $1",
    [email],
  );
  const row = rows[0];
  if (!row) {
    // Auch ohne Treffer rechnen, damit die Antwortzeit nicht verrät,
    // ob es das Konto überhaupt gibt.
    await hashPassword(password);
    return null;
  }
  return (await verifyPassword(password, row.password_hash)) ? { id: row.id, email: row.email } : null;
}

/* ── Sitzung ───────────────────────────────────────────────── */

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function equal(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function startSession(user: User): Promise<void> {
  const expiry = Date.now() + MAX_AGE * 1000;
  const payload = `${user.id}.${expiry}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
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

/** Gibt das angemeldete Konto zurück – oder null, wenn nichts Gültiges anliegt. */
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, rawExpiry, signature] = parts;
  const expiry = Number(rawExpiry);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return null;
  if (!equal(signature, sign(`${id}.${expiry}`))) return null;

  const { rows } = await getPool().query<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

/* ── Bremse gegen Durchprobieren ───────────────────────────── */

const attempts = new Map<string, { count: number; until: number }>();
const WINDOW = 60_000;
const LIMIT = 10;

export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.until < now) {
    attempts.set(key, { count: 1, until: now + WINDOW });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}

/** Optionaler Einladungscode: verhindert, dass Fremde Konten anlegen. */
export function signupCodeRequired(): boolean {
  return Boolean(process.env.SIGNUP_CODE);
}

export function signupCodeOk(candidate: unknown): boolean {
  const expected = process.env.SIGNUP_CODE;
  if (!expected) return true;
  return typeof candidate === "string" && equal(candidate, expected);
}

import { NextResponse } from "next/server";
import {
  clearAttempts,
  currentUser,
  endSession,
  findUser,
  normalizeEmail,
  signupCodeRequired,
  startSession,
  tooManyAttempts,
} from "@/lib/server/auth";
import { ensureSchema, isConfigured } from "@/lib/server/db";
import { ensureProfile, profileById } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unbekannt";
}

function noDatabase() {
  return NextResponse.json(
    { error: "Keine Datenbank verbunden. DATABASE_URL setzen – siehe .env.example." },
    { status: 503 },
  );
}

/** Wer ist angemeldet? Wird beim Start der App gefragt. */
export async function GET() {
  if (!isConfigured()) return noDatabase();
  try {
    await ensureSchema();
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ user: null, profile: null, signupCodeRequired: signupCodeRequired() });
    }
    // Konten aus der Zeit vor den Profilen bekommen hier ihren Handle.
    await ensureProfile(user.id, user.email);
    return NextResponse.json({
      user,
      profile: await profileById(user.id, user.id),
      signupCodeRequired: signupCodeRequired(),
    });
  } catch {
    return NextResponse.json({ user: null, signupCodeRequired: signupCodeRequired() });
  }
}

/** Anmelden. */
export async function POST(request: Request) {
  if (!isConfigured()) return noDatabase();

  const ip = clientIp(request);
  if (tooManyAttempts(`login:${ip}`)) {
    return NextResponse.json({ error: "Zu viele Versuche. Warte eine Minute." }, { status: 429 });
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email || typeof body.password !== "string") {
    return NextResponse.json({ error: "E-Mail oder Passwort stimmt nicht." }, { status: 401 });
  }

  try {
    await ensureSchema();
    const user = await findUser(email, body.password);
    if (!user) {
      // Absichtlich dieselbe Meldung wie bei unbekannter E-Mail.
      return NextResponse.json({ error: "E-Mail oder Passwort stimmt nicht." }, { status: 401 });
    }
    clearAttempts(`login:${ip}`);
    await ensureProfile(user.id, user.email);
    await startSession(user);
    return NextResponse.json({ user, profile: await profileById(user.id, user.id) });
  } catch (err) {
    console.error("[api/auth/session]", err);
    return NextResponse.json({ error: "Anmeldung gerade nicht möglich." }, { status: 502 });
  }
}

/** Abmelden. */
export async function DELETE() {
  await endSession();
  return NextResponse.json({ user: null });
}

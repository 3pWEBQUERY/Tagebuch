import { NextResponse } from "next/server";
import {
  clearAttempts,
  createUser,
  normalizeEmail,
  passwordProblem,
  signupCodeOk,
  signupCodeRequired,
  startSession,
  tooManyAttempts,
} from "@/lib/server/auth";
import { ensureSchema, isConfigured } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unbekannt";
}

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Keine Datenbank verbunden. DATABASE_URL setzen – siehe .env.example." },
      { status: 503 },
    );
  }

  const ip = clientIp(request);
  if (tooManyAttempts(`register:${ip}`)) {
    return NextResponse.json({ error: "Zu viele Versuche. Warte eine Minute." }, { status: 429 });
  }

  let body: { email?: unknown; password?: unknown; code?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  if (signupCodeRequired() && !signupCodeOk(body.code)) {
    return NextResponse.json({ error: "Der Einladungscode stimmt nicht." }, { status: 403 });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return NextResponse.json({ error: "Diese E-Mail-Adresse sieht nicht gültig aus." }, { status: 400 });
  }
  const problem = passwordProblem(body.password);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  try {
    await ensureSchema();
    const result = await createUser(email, body.password as string);
    if (result === "exists") {
      return NextResponse.json(
        { error: "Für diese E-Mail gibt es schon ein Konto. Melde dich an." },
        { status: 409 },
      );
    }
    clearAttempts(`register:${ip}`);
    await startSession(result);
    return NextResponse.json({ user: result });
  } catch (err) {
    console.error("[api/auth/register]", err);
    return NextResponse.json({ error: "Registrierung gerade nicht möglich." }, { status: 502 });
  }
}

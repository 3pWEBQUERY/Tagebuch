import { NextResponse } from "next/server";
import {
  authRequired,
  checkPassword,
  clearAttempts,
  endSession,
  isAuthenticated,
  startSession,
  tooManyAttempts,
} from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unbekannt";
}

/** Sagt der Oberfläche, ob überhaupt eine Passphrase nötig ist. */
export async function GET() {
  return NextResponse.json({
    required: authRequired(),
    authenticated: await isAuthenticated(),
  });
}

export async function POST(request: Request) {
  if (!authRequired()) {
    return NextResponse.json({ required: false, authenticated: true });
  }

  const ip = clientIp(request);
  if (tooManyAttempts(ip)) {
    return NextResponse.json(
      { error: "Zu viele Versuche. Warte eine Minute." },
      { status: 429 },
    );
  }

  let password: unknown;
  try {
    ({ password } = (await request.json()) as { password?: unknown });
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "Passphrase stimmt nicht." }, { status: 401 });
  }

  clearAttempts(ip);
  await startSession();
  return NextResponse.json({ required: true, authenticated: true });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ required: authRequired(), authenticated: false });
}

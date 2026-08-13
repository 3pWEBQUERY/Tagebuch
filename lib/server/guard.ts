import "server-only";

import { NextResponse } from "next/server";
import { currentUser, type User } from "./auth";
import { ensureSchema, isConfigured } from "./db";

/**
 * Jede soziale Route braucht dieselben drei Prüfungen: Datenbank vorhanden,
 * Schema angelegt, jemand angemeldet. Einmal hier statt achtmal verstreut.
 */
export async function withUser(
  handler: (user: User) => Promise<NextResponse>,
): Promise<NextResponse> {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Keine Datenbank verbunden." }, { status: 503 });
  }
  try {
    await ensureSchema();
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    return await handler(user);
  } catch (err) {
    console.error("[api]", err);
    return NextResponse.json({ error: "Das hat gerade nicht geklappt." }, { status: 502 });
  }
}

export const notFound = () => NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

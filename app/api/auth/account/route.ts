import { NextResponse } from "next/server";
import { currentUser, endSession } from "@/lib/server/auth";
import { ensureSchema, getPool, isConfigured } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Konto und alles daran endgültig löschen. Ein Tagebuch, das man nicht wieder
 * loswird, wäre eine Zumutung – und ohne diesen Weg bliebe jeder Fehlversuch
 * für immer in der Datenbank stehen.
 */
export async function DELETE() {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Keine Datenbank verbunden." }, { status: 503 });
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  try {
    await ensureSchema();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM entries WHERE user_id = $1", [user.id]);
      await client.query("DELETE FROM users WHERE id = $1", [user.id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await endSession();
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[api/auth/account]", err);
    return NextResponse.json({ error: "Löschen gerade nicht möglich." }, { status: 502 });
  }
}

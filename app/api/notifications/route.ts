import { NextResponse } from "next/server";
import { withUser } from "@/lib/server/guard";
import { markNotificationsRead, readNotifications } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return withUser(async (user) => NextResponse.json(await readNotifications(user.id)));
}

/** Alles als gelesen markieren – beim Öffnen der Liste. */
export async function POST() {
  return withUser(async (user) => {
    await markNotificationsRead(user.id);
    return NextResponse.json({ ok: true });
  });
}

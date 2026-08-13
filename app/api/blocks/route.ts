import { NextResponse } from "next/server";
import { withUser } from "@/lib/server/guard";
import { blockedProfiles } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Die eigene Blockliste – damit sich eine Blockade auch zurücknehmen lässt. */
export async function GET() {
  return withUser(async (user) => NextResponse.json({ blocked: await blockedProfiles(user.id) }));
}

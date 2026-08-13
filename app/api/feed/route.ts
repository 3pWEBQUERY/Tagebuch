import { NextResponse } from "next/server";
import { withUser } from "@/lib/server/guard";
import { readFeed, type FeedScope } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Der Feed: „Folge ich“ oder „Entdecken“, seitenweise über published_at. */
export async function GET(request: Request) {
  return withUser(async (user) => {
    const params = new URL(request.url).searchParams;
    const scope: FeedScope = params.get("scope") === "discover" ? "discover" : "following";
    const before = Number(params.get("before")) || null;
    const items = await readFeed({ viewerId: user.id, scope, before, limit: 20 });
    return NextResponse.json({ items });
  });
}

import { NextResponse } from "next/server";
import { withUser } from "@/lib/server/guard";
import { searchProfiles, suggestedProfiles } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Menschen finden: mit Suchbegriff gesucht, ohne vorgeschlagen. */
export async function GET(request: Request) {
  return withUser(async (user) => {
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    const profiles = query
      ? await searchProfiles(query, user.id)
      : await suggestedProfiles(user.id);
    return NextResponse.json({ profiles, suggested: query === "" });
  });
}

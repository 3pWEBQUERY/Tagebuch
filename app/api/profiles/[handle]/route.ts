import { NextResponse } from "next/server";
import { notFound, withUser } from "@/lib/server/guard";
import { profileByHandle, readFeed } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Ein fremdes (oder eigenes) Profil samt seiner öffentlichen Einträge. */
export async function GET(request: Request, context: { params: Promise<{ handle: string }> }) {
  return withUser(async (user) => {
    const { handle } = await context.params;
    const profile = await profileByHandle(handle, user.id);
    if (!profile) return notFound();
    const before = Number(new URL(request.url).searchParams.get("before")) || null;
    const items = await readFeed({ viewerId: user.id, scope: "profile", handle, before, limit: 20 });
    return NextResponse.json({ profile, items });
  });
}

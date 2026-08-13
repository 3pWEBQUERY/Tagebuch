import { NextResponse } from "next/server";
import { withUser } from "@/lib/server/guard";
import { profileById, updateProfile } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Das eigene Profil lesen. */
export async function GET() {
  return withUser(async (user) => NextResponse.json({ profile: await profileById(user.id, user.id) }));
}

/** Namen, Handle oder Kurztext ändern. */
export async function PATCH(request: Request) {
  return withUser(async (user) => {
    let body: { handle?: unknown; displayName?: unknown; bio?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
    }
    const result = await updateProfile(user.id, {
      handle: typeof body.handle === "string" ? body.handle : undefined,
      displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      bio: typeof body.bio === "string" ? body.bio : undefined,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ profile: result });
  });
}

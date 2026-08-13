import { NextResponse } from "next/server";
import { withUser } from "@/lib/server/guard";
import { createReport } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return withUser(async (user) => {
    let body: { handle?: unknown; entryId?: unknown; commentId?: unknown; reason?: unknown; note?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
    }
    if (typeof body.reason !== "string" || !body.reason) {
      return NextResponse.json({ error: "Bitte einen Grund wählen." }, { status: 400 });
    }
    const ok = await createReport({
      reporterId: user.id,
      handle: typeof body.handle === "string" ? body.handle : null,
      entryId: typeof body.entryId === "string" ? body.entryId : null,
      commentId: typeof body.commentId === "string" ? body.commentId : null,
      reason: body.reason,
      note: typeof body.note === "string" ? body.note : "",
    });
    return ok
      ? NextResponse.json({ reported: true })
      : NextResponse.json({ error: "Nichts zu melden gefunden." }, { status: 400 });
  });
}

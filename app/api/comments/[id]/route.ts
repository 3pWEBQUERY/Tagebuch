import { NextResponse } from "next/server";
import { notFound, withUser } from "@/lib/server/guard";
import { deleteComment } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Löschen darf die Verfasserin – und wem der Eintrag gehört. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withUser(async (user) => {
    const { id } = await context.params;
    return (await deleteComment(user.id, id)) ? NextResponse.json({ deleted: true }) : notFound();
  });
}

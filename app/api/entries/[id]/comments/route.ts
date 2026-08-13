import { NextResponse } from "next/server";
import { notFound, withUser } from "@/lib/server/guard";
import { readComments, writeComment } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withUser(async (user) => {
    const { id } = await context.params;
    const comments = await readComments(id, user.id);
    if (!comments) return notFound();
    return NextResponse.json({ comments });
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withUser(async (user) => {
    const { id } = await context.params;
    let body: { body?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
    }
    if (typeof body.body !== "string" || !body.body.trim()) {
      return NextResponse.json({ error: "Der Kommentar ist leer." }, { status: 400 });
    }
    const comment = await writeComment(user.id, id, body.body);
    if (!comment) return notFound();
    return NextResponse.json({ comment });
  });
}

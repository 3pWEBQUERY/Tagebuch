import { NextResponse } from "next/server";
import { notFound, withUser } from "@/lib/server/guard";
import { setLike } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function toggle(context: { params: Promise<{ id: string }> }, liked: boolean) {
  return withUser(async (user) => {
    const { id } = await context.params;
    const result = await setLike(user.id, id, liked);
    if (!result) return notFound();
    return NextResponse.json(result);
  });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return toggle(context, true);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return toggle(context, false);
}

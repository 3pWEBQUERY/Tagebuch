import { NextResponse } from "next/server";
import { notFound, withUser } from "@/lib/server/guard";
import { setFollow } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function toggle(context: { params: Promise<{ handle: string }> }, follow: boolean) {
  return withUser(async (user) => {
    const { handle } = await context.params;
    const profile = await setFollow(user.id, handle, follow);
    if (!profile) return notFound();
    return NextResponse.json({ profile });
  });
}

export async function POST(_request: Request, context: { params: Promise<{ handle: string }> }) {
  return toggle(context, true);
}

export async function DELETE(_request: Request, context: { params: Promise<{ handle: string }> }) {
  return toggle(context, false);
}

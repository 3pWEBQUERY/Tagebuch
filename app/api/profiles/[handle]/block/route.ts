import { NextResponse } from "next/server";
import { notFound, withUser } from "@/lib/server/guard";
import { setBlock } from "@/lib/server/social";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function toggle(context: { params: Promise<{ handle: string }> }, blocked: boolean) {
  return withUser(async (user) => {
    const { handle } = await context.params;
    const result = await setBlock(user.id, handle, blocked);
    return result ? NextResponse.json(result) : notFound();
  });
}

export async function POST(_r: Request, context: { params: Promise<{ handle: string }> }) {
  return toggle(context, true);
}

export async function DELETE(_r: Request, context: { params: Promise<{ handle: string }> }) {
  return toggle(context, false);
}

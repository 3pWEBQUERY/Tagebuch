import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withUser } from "@/lib/server/guard";
import { getPool } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Obergrenze mit Luft: der Browser liefert nach dem Verkleinern deutlich weniger. */
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = new Set(["image/webp", "image/jpeg", "image/png"]);

export async function POST(request: Request) {
  return withUser(async (user) => {
    const form = await request.formData();
    const file = form.get("photo");
    const width = Number(form.get("width"));
    const height = Number(form.get("height"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Kein Bild empfangen." }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: "Dieses Bildformat geht nicht." }, { status: 415 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Das Bild ist zu groß." }, { status: 413 });
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      return NextResponse.json({ error: "Bildmaße fehlen." }, { status: 400 });
    }

    const id = randomUUID();
    const bytes = Buffer.from(await file.arrayBuffer());
    await getPool().query(
      "INSERT INTO photos (id, user_id, mime, width, height, bytes) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, user.id, file.type, Math.round(width), Math.round(height), bytes],
    );
    return NextResponse.json({ photo: { id, width: Math.round(width), height: Math.round(height) } });
  });
}

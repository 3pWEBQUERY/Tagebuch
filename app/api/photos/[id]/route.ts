import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
import { getPool, isConfigured } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Ein Bild bekommt zu sehen, wem es gehört – und jede angemeldete Person,
 * sobald es an einem öffentlichen Eintrag hängt. Ein Bild an einem privaten
 * Eintrag bleibt privat, auch wenn jemand die id errät.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isConfigured()) return new NextResponse(null, { status: 503 });
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { id } = await context.params;
  const { rows } = await getPool().query<{ mime: string; bytes: Buffer; visible: boolean }>(
    `SELECT p.mime, p.bytes,
            (p.user_id = $2 OR EXISTS (
               SELECT 1 FROM entries e
                WHERE e.photo_id = p.id
                  AND e.visibility = 'public'
                  AND e.deleted_at IS NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM blocks b
                     WHERE (b.blocker_id = $2 AND b.blocked_id = e.user_id)
                        OR (b.blocker_id = e.user_id AND b.blocked_id = $2)
                  )
             )) AS visible
       FROM photos p
      WHERE p.id = $1`,
    [id, user.id],
  );

  const photo = rows[0];
  if (!photo || !photo.visible) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: {
      "content-type": photo.mime,
      // Die id ist zufällig und der Inhalt unveränderlich – darf dauerhaft liegen bleiben.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

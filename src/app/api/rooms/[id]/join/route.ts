import { NextRequest, NextResponse } from "next/server";
import { joinRoom, publicRoom } from "@/lib/rooms-store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const guestName = body.guestName || "Misafir";
    const guestAccessToken = typeof body.guestAccessToken === "string" ? body.guestAccessToken : "";
    if (guestAccessToken.length < 32) {
      return NextResponse.json({ error: "Oda erişim anahtarı geçersiz." }, { status: 400 });
    }

    const result = await joinRoom(id, guestAccessToken, guestName);
    if (result.conflict) {
      return NextResponse.json({ error: "Oda ba\u015fka bir misafir taraf\u0131ndan al\u0131nd\u0131." }, { status: 409 });
    }
    if (!result.room) {
      return NextResponse.json({ error: "Oda bulunamad\u0131." }, { status: 404 });
    }

    return NextResponse.json({ success: true, room: publicRoom(result.room) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Odaya katılınamadı";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

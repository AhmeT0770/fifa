import { NextRequest, NextResponse } from "next/server";
import { addBotOpponent, getRoom, publicRoom, roomTokenMatches } from "@/lib/rooms-store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const existingRoom = await getRoom(id);
    if (!existingRoom) return NextResponse.json({ error: "Oda bulunamadı." }, { status: 404 });
    if (!roomTokenMatches(existingRoom, body.roomToken, "host")) {
      return NextResponse.json({ error: "Oda kurucusu için erişim anahtarı geçersiz." }, { status: 403 });
    }
    const room = await addBotOpponent(id);
    if (!room) {
      return NextResponse.json({ error: "Oda bulunamadı." }, { status: 404 });
    }

    return NextResponse.json({ success: true, room: publicRoom(room) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Bot eklenemedi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

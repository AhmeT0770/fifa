import { NextRequest, NextResponse } from "next/server";
import { cancelRematchRoom, getRoom, publicRoom, rematchRoom, roomTokenMatches } from "@/lib/rooms-store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const existingRoom = await getRoom(id);
    if (!existingRoom) return NextResponse.json({ error: "Oda bulunamadı." }, { status: 404 });
    const role = roomTokenMatches(existingRoom, body.roomToken, "host")
      ? "host"
      : roomTokenMatches(existingRoom, body.roomToken, "guest")
        ? "guest"
        : null;
    if (!role) {
      return NextResponse.json({ error: "Maç katılımcısı için erişim anahtarı geçersiz." }, { status: 403 });
    }
    if (body.action !== undefined && body.action !== "ready" && body.action !== "cancel") {
      return NextResponse.json({ error: "Rövanş işlemi geçersiz." }, { status: 400 });
    }
    if (body.action === "cancel") {
      if (!existingRoom.matchResult || Date.now() - existingRoom.matchStartedAt < 60_000) {
        return NextResponse.json({ error: "Rövanş onayı bu maç bittikten sonra geri alınabilir." }, { status: 409 });
      }
      const room = await cancelRematchRoom(id, role);
      if (!room) return NextResponse.json({ error: "Oda bulunamadı." }, { status: 404 });
      return NextResponse.json({ success: true, started: false, room: publicRoom(room) });
    }
    if (!existingRoom.matchResult || Date.now() - existingRoom.matchStartedAt < 60_000) {
      return NextResponse.json({ error: "Rövanş için mevcut maçın bitmesini bekleyin." }, { status: 409 });
    }
    const regulationDraw = existingRoom.matchResult.regularHomeScore === existingRoom.matchResult.regularAwayScore;
    if (regulationDraw && !existingRoom.matchResult.extraTimeMode) {
      return NextResponse.json({ error: "Önce beraberlik uzatmasını tamamlayın." }, { status: 409 });
    }
    const room = await rematchRoom(id, role);
    if (!room) {
      return NextResponse.json({ error: "Oda bulunamadı." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      started: room.status === "playing" && !room.rematchReady.host && !room.rematchReady.guest,
      room: publicRoom(room),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Rövanş başlatılamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

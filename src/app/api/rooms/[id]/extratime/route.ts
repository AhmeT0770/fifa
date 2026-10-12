import { NextRequest, NextResponse } from "next/server";
import { applyExtraTimeMode, getRoom, publicRoom, roomTokenMatches } from "@/lib/rooms-store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode;
    const existingRoom = await getRoom(id);
    if (!existingRoom) return NextResponse.json({ error: "Oda veya maç bulunamadı." }, { status: 404 });
    if (!roomTokenMatches(existingRoom, body.roomToken)) {
      return NextResponse.json({ error: "Maç katılımcısı için erişim anahtarı geçersiz." }, { status: 403 });
    }
    if (!existingRoom.matchResult) {
      return NextResponse.json({ error: "Maç sonucu henüz hazır değil." }, { status: 409 });
    }

    // The first participant to choose locks the mode. Later requests receive
    // that canonical result instead of simulating extra time a second time.
    if (existingRoom.matchResult.extraTimeMode) {
      return NextResponse.json({ success: true, room: publicRoom(existingRoom) });
    }
    if (Date.now() - existingRoom.matchStartedAt < 60_000) {
      return NextResponse.json({ error: "Uzatma seçimi için normal sürenin bitmesini bekleyin." }, { status: 409 });
    }
    if (existingRoom.matchResult.regularHomeScore !== existingRoom.matchResult.regularAwayScore) {
      return NextResponse.json({ error: "Uzatma yalnızca beraberlikte başlatılabilir." }, { status: 409 });
    }
    if (mode !== "golden_goal" && mode !== "classic") {
      return NextResponse.json({ error: "Uzatma seçeneği geçersiz." }, { status: 400 });
    }

    const room = await applyExtraTimeMode(id, mode);
    if (!room) {
      return NextResponse.json({ error: "Oda veya maç bulunamadı." }, { status: 404 });
    }

    return NextResponse.json({ success: true, room: publicRoom(room) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Uzatmalar başlatılamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

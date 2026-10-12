import { NextResponse } from "next/server";
import { getRoom, roomTokenMatches } from "@/lib/rooms-store";
import { recordRankedRoomResult } from "@/lib/ranked";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const room = await getRoom(id);
  if (!room) return NextResponse.json({ error: "Oda bulunamadı." }, { status: 404 });
  if (!room.ranked) return NextResponse.json({ error: "Bu oda ranked değil." }, { status: 400 });
  if (!roomTokenMatches(room, body.roomToken)) {
    return NextResponse.json({ error: "Maç katılımcısı için erişim anahtarı geçersiz." }, { status: 403 });
  }
  if (!room.matchResult || !room.host.ready || !room.guest?.ready) {
    return NextResponse.json({ error: "Maç sonucu henüz hazır değil." }, { status: 409 });
  }
  const isRegulationDraw = room.matchResult.regularHomeScore === room.matchResult.regularAwayScore;
  if (Date.now() - room.matchStartedAt < 60_000 || (isRegulationDraw && !room.matchResult.extraTimeMode)) {
    return NextResponse.json({ error: "Maç bitmeden ranked sonucu kaydedilemez." }, { status: 409 });
  }

  try {
    const outcome = await recordRankedRoomResult(room);
    if (!outcome.configured) {
      return NextResponse.json({ configured: false, error: "Sıralama veritabanı ayarlanmamış." }, { status: 503 });
    }
    if (outcome.skipped) {
      return NextResponse.json({ configured: true, skipped: true, error: "Bot maçları sıralamaya dahil edilmez." }, { status: 422 });
    }
    return NextResponse.json({ configured: true, result: outcome.result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ranked sonucu kaydedilemedi.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

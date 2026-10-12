import { NextRequest, NextResponse } from "next/server";
import { getRoom, publicRoom, roomTokenMatches, setParticipantReady } from "@/lib/rooms-store";
import type { Roster } from "@/lib/types";
import { validateRoster, fillMissingAttributes } from "@/lib/roster-validator";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const role = (body.role as "host" | "guest") || "host";
    if (role !== "host" && role !== "guest") {
      return NextResponse.json({ error: "Oyuncu rolü geçersiz." }, { status: 400 });
    }
    const rawRoster = body.roster as Roster;
    const profileId = typeof body.profileId === "string" ? body.profileId : undefined;
    const roomToken = body.roomToken;
    const profileName = typeof body.profileName === "string" ? body.profileName.trim().slice(0, 32) : undefined;

    if (!rawRoster) {
      return NextResponse.json({ error: "Kadro verisi bulunamadı." }, { status: 400 });
    }

    const errors = validateRoster(rawRoster);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Kadro geçersiz", details: errors.map((e) => e.message) },
        { status: 422 }
      );
    }

    // Eksik özellikleri tamamla
    const filledRoster: Roster = {
      ...rawRoster,
      players: rawRoster.players.map(fillMissingAttributes),
    };

    const existingRoom = await getRoom(id);
    if (!existingRoom) return NextResponse.json({ error: "Oda bulunamadı." }, { status: 404 });
    if (!roomTokenMatches(existingRoom, roomToken, role)) {
      return NextResponse.json({ error: "Bu oda katılımcısı için erişim anahtarı geçersiz." }, { status: 403 });
    }
    if (existingRoom?.ranked && (!profileId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId))) {
      return NextResponse.json({ error: "Ranked profili okunamadı. Sayfayı yenileyip tekrar dene." }, { status: 400 });
    }
    if (existingRoom?.ranked && role === "host" && existingRoom.host.profileId !== profileId) {
      return NextResponse.json({ error: "Oda kurucusunun profili eşleşmiyor." }, { status: 403 });
    }
    if (existingRoom?.ranked && role === "guest" && existingRoom.guest?.profileId && existingRoom.guest.profileId !== profileId) {
      return NextResponse.json({ error: "Bu oda başka bir ranked profille eşleşmiş." }, { status: 403 });
    }

    const room = await setParticipantReady(id, role, filledRoster, profileId ? { id: profileId, name: profileName || "Teknik Direktör" } : undefined);
    if (!room) {
      return NextResponse.json({ error: "Oda bulunamadı." }, { status: 404 });
    }

    return NextResponse.json({ success: true, room: publicRoom(room) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Kadro onaylanamadı";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

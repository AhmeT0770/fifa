import { NextRequest, NextResponse } from "next/server";
import { createRoom, listOpenRooms, publicRoom } from "@/lib/rooms-store";
import type { GameVersion } from "@/lib/types";

export async function GET(request: Request) {
  const game = new URL(request.url).searchParams.get("game");
  if (game && game !== "fifa14" && game !== "fifa15") {
    return NextResponse.json({ error: "Oyun sürümü geçersiz." }, { status: 400 });
  }
  return NextResponse.json(
    { rooms: await listOpenRooms(game as GameVersion | undefined) },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const game = (body.game as GameVersion) || "fifa15";
    if (game !== "fifa14" && game !== "fifa15") {
      return NextResponse.json({ error: "Oyun sürümü geçersiz." }, { status: 400 });
    }

    const ranked = body.ranked === true;
    const hostName = typeof body.hostName === "string" ? body.hostName.trim().slice(0, 32) : "Ev Sahibi";
    const profileId = typeof body.profileId === "string" ? body.profileId : undefined;
    const hostAccessToken = typeof body.hostAccessToken === "string" ? body.hostAccessToken : undefined;
    if (ranked && (!profileId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId))) {
      return NextResponse.json({ error: "Ranked profili bulunamadı. Sayfayı yenileyip tekrar dene." }, { status: 400 });
    }
    if (!hostAccessToken || hostAccessToken.length < 32) {
      return NextResponse.json({ error: "Oda erişim anahtarı geçersiz." }, { status: 400 });
    }

    const room = await createRoom(game, hostName || "Teknik Direkt?r", { ranked, profileId, hostAccessToken });
    return NextResponse.json({ success: true, room: publicRoom(room) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Oda oluşturulamadı";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

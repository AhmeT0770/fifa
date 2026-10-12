import { NextRequest, NextResponse } from "next/server";
import { getRoom, publicRoom } from "@/lib/rooms-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const room = await getRoom(id);

  if (!room) {
    return NextResponse.json({ error: "Oda bulunamadı." }, { status: 404 });
  }

  return NextResponse.json(
    { success: true, room: publicRoom(room) },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

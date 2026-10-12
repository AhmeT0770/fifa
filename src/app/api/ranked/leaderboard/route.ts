import { NextRequest, NextResponse } from "next/server";
import type { GameVersion } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

interface RankRow {
  profile_id: string;
  display_name: string;
  rating: number;
  wins: number;
  draws: number;
  losses: number;
  matches: number;
}

export async function GET(request: NextRequest) {
  const game = request.nextUrl.searchParams.get("game") as GameVersion | null;
  const profileId = request.nextUrl.searchParams.get("profileId");
  if (game !== "fifa14" && game !== "fifa15") {
    return NextResponse.json({ error: "Oyun sürümü geçersiz." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ configured: false, error: "Supabase bağlantısı ayarlanmamış." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("ranked_profiles")
    .select("profile_id, display_name, rating, wins, draws, losses, matches")
    .eq("game_version", game)
    .order("rating", { ascending: false })
    .order("matches", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 503 });

  let ownProfile: RankRow | null = null;
  if (profileId && /^[0-9a-f-]{36}$/i.test(profileId)) {
    const { data: ownData } = await supabase
      .from("ranked_profiles")
      .select("profile_id, display_name, rating, wins, draws, losses, matches")
      .eq("game_version", game)
      .eq("profile_id", profileId)
      .maybeSingle();
    ownProfile = (ownData as RankRow | null) ?? null;
  }

  return NextResponse.json({ configured: true, leaderboard: (data as RankRow[]) ?? [], ownProfile });
}

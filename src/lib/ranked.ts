import type { Room } from "./rooms-store";
import { getSupabaseAdmin } from "./supabase-admin";

export async function recordRankedRoomResult(room: Room) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { configured: false as const };

  const home = room.host;
  const away = room.guest;
  const result = room.matchResult;
  if (!room.ranked || !result || !home.profileId || !away?.profileId) {
    return { configured: true as const, skipped: true as const };
  }

  const homeOutcome = result.homeScore > result.awayScore
    ? 1
    : result.homeScore < result.awayScore
      ? 0
      : result.penaltyShootout
        ? result.penaltyShootout.winner === "home" ? 1 : 0
        : 0.5;

  const { data, error } = await supabase.rpc("submit_ranked_result", {
    p_room_id: room.rankedMatchId,
    p_game_version: room.gameVersion,
    p_home_profile_id: home.profileId,
    p_home_name: home.name || home.roster?.teamName || "Teknik Direktör",
    p_away_profile_id: away.profileId,
    p_away_name: away.name || away.roster?.teamName || "Teknik Direktör",
    p_home_score: result.homeScore,
    p_away_score: result.awayScore,
    p_home_outcome: homeOutcome,
  });

  if (error) throw new Error(error.message);
  return { configured: true as const, skipped: false as const, result: data };
}

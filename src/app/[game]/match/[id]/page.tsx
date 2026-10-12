import { notFound } from "next/navigation";
import type { GameVersion } from "@/lib/types";
import MatchLiveRoomClient from "./_components/MatchLiveRoomClient";

export const instant = false;

const VALID_GAMES: GameVersion[] = ["fifa14", "fifa15"];

export default async function MatchLivePage({
  params,
}: {
  params: Promise<{ game: string; id: string }>;
}) {
  const { game, id } = await params;

  if (!VALID_GAMES.includes(game as GameVersion)) {
    notFound();
  }

  return <MatchLiveRoomClient game={game as GameVersion} roomId={id} />;
}

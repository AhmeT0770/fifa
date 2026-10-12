import { notFound } from "next/navigation";
import type { GameVersion } from "@/lib/types";
import GameHubClient from "./_components/GameHubClient";

export const instant = false;

const VALID_GAMES: GameVersion[] = ["fifa14", "fifa15"];

export default async function GamePage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;

  if (!VALID_GAMES.includes(game as GameVersion)) {
    notFound();
  }

  return <GameHubClient game={game as GameVersion} />;
}

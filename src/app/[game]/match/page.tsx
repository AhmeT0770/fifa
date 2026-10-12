import { notFound } from "next/navigation";
import type { GameVersion } from "@/lib/types";
import MatchPageClient from "./_components/MatchPageClient";

export const instant = false;

const VALID_GAMES: GameVersion[] = ["fifa14", "fifa15"];

export default async function MatchPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;

  if (!VALID_GAMES.includes(game as GameVersion)) {
    notFound();
  }

  return <MatchPageClient game={game as GameVersion} />;
}

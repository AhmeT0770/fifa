import { notFound } from "next/navigation";
import type { GameVersion } from "@/lib/types";
import RankedPageClient from "./_components/RankedPageClient";

const VALID_GAMES: GameVersion[] = ["fifa14", "fifa15"];

export default async function RankedPage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!VALID_GAMES.includes(game as GameVersion)) notFound();
  return <RankedPageClient game={game as GameVersion} />;
}

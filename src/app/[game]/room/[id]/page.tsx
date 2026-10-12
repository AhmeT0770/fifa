import { notFound } from "next/navigation";
import type { GameVersion } from "@/lib/types";
import RoomLobbyClient from "./_components/RoomLobbyClient";

export const instant = false;

const VALID_GAMES: GameVersion[] = ["fifa14", "fifa15"];

export default async function RoomPage({
  params,
}: {
  params: Promise<{ game: string; id: string }>;
}) {
  const { game, id } = await params;

  if (!VALID_GAMES.includes(game as GameVersion)) {
    notFound();
  }

  return <RoomLobbyClient game={game as GameVersion} roomId={id} />;
}

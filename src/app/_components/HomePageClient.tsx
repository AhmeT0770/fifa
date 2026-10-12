"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GameVersion } from "@/lib/types";
import { createRoomAccessToken, saveRoomAccessToken } from "@/lib/room-access";

interface WaitingRoom {
  id: string;
  gameVersion: GameVersion;
  createdAt: number;
  teamName: string;
  formation: string;
  teamRating: number | null;
  rosterReady: boolean;
}

const games: Array<{ id: GameVersion; year: string; tone: string; accent: string }> = [
  { id: "fifa14", year: "14", tone: "from-[#111a20] via-[#10171c] to-[#102923]", accent: "text-[#00d7b0]" },
  { id: "fifa15", year: "15", tone: "from-[#171c20] via-[#13191e] to-[#253018]", accent: "text-[#c6f000]" },
];

function waitingLabel(createdAt: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60_000));
  return minutes === 0 ? "Az önce hazırlandı" : `${minutes} dk. rakip bekliyor`;
}

export default function HomePageClient() {
  const router = useRouter();
  const [rooms, setRooms] = useState<WaitingRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refreshRooms = useCallback(async () => {
    try {
      const response = await fetch("/api/rooms", { cache: "no-store" });
      if (!response.ok) throw new Error("Bekleyen kadrolar şu an alınamıyor.");
      const data = await response.json();
      setRooms(data.rooms ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Bekleyen kadrolar alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshRooms();
    const interval = setInterval(() => void refreshRooms(), 5000);
    return () => clearInterval(interval);
  }, [refreshRooms]);

  const joinWaitingRoom = async (room: WaitingRoom) => {
    setJoiningId(room.id);
    setError("");
    try {
      const guestAccessToken = createRoomAccessToken();
      const response = await fetch(`/api/rooms/${room.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestName: "Misafir", guestAccessToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bu kadro artık rakip beklemiyor.");
      saveRoomAccessToken(room.id, "guest", guestAccessToken);
      router.push(`/${room.gameVersion}/room/${room.id}?role=guest`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Odaya katılınamadı.");
      await refreshRooms();
      setJoiningId(null);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070a0e] px-4 py-6 text-white sm:py-9" style={{ backgroundImage: "radial-gradient(ellipse at 50% -20%, rgba(96,133,0,.2), transparent 48%), linear-gradient(180deg,#0b1117 0%,#070a0e 60%)" }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-[0.08]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 42px, #a5e900 43px 44px), repeating-linear-gradient(90deg, transparent 0 42px, #a5e900 43px 44px)", maskImage: "linear-gradient(to bottom,black,transparent)" }} />

      <div className="relative mx-auto max-w-6xl">
        <div className="mb-12 flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center border border-[#b8e600]/50 bg-[#b8e600]/10 text-sm font-black italic text-[#c9f000]">F</span>
            <p className="text-sm font-black uppercase tracking-[0.2em]">FIFA <span className="text-[#c9f000]">MAÇ SİM</span></p>
          </div>
          <div className="hidden items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 sm:flex"><span className="h-2 w-2 animate-pulse rounded-full bg-[#b8e600]" /> Maç Merkezi</div>
        </div>

        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#b9e600]">01 / Oyun sürümü</p>
            <h1 className="text-4xl font-black uppercase leading-none tracking-[-0.04em] text-white sm:text-6xl">Oyunu seç</h1>
          </div>
        </header>

        <section aria-labelledby="game-choice-title">
          <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
            <h2 id="game-choice-title" className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Oyun seçimi</h2>
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Sürüm seç</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/${game.id}`}
                className={`group relative isolate min-h-64 overflow-hidden border border-white/10 bg-gradient-to-br p-5 transition duration-200 hover:border-[#b9e600]/70 hover:brightness-110 sm:p-7 ${game.tone}`}
              >
                <div className="absolute inset-y-0 right-0 -z-10 flex select-none items-center pr-5 text-[190px] font-black italic leading-none text-white/[0.035] transition group-hover:text-white/[0.07]">{game.year}</div>
                <div className="flex min-h-52 flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className={`border-l-2 border-current pl-2 text-[9px] font-black uppercase tracking-[0.2em] ${game.accent}`}>{game.id === "fifa14" ? "Klasik sezon" : "Yeni sezon"}</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">{game.year}</span>
                  </div>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">EA SPORTS · FUTBOL</p>
                      <h3 className="text-5xl font-black italic leading-none tracking-[-0.06em] text-white">FIFA <span className={game.accent}>{game.year}</span></h3>
                    </div>
                    <span className="mb-1 grid h-11 w-11 shrink-0 place-items-center border border-[#b9e600]/50 bg-[#b9e600] text-xl font-black text-[#10150b] transition group-hover:translate-x-1" aria-label="Oyunu seç">→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="waiting-rooms-title" className="mt-8 border border-white/10 bg-[#0e141a] p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-[#b9e600]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#b9e600]" /> Canlı eşleşme
              </div>
              <h2 id="waiting-rooms-title" className="text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">Rakip bekleyen kadrolar</h2>
            </div>
            <button onClick={() => void refreshRooms()} className="self-start border border-white/15 bg-white/[0.04] px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300 transition hover:border-[#b9e600]/50 hover:text-white sm:self-auto">
              Yenile
            </button>
          </div>

          {error && <p role="status" className="mb-4 border border-rose-900/70 bg-rose-950/50 px-4 py-3 text-sm text-rose-200">{error}</p>}

          {loading ? (
            <div className="border border-white/5 bg-black/20 px-5 py-8 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Aktif kadrolar aranıyor…</div>
          ) : rooms.length === 0 ? (
            <div className="border border-dashed border-white/10 bg-black/20 px-5 py-8 text-center">
              <div className="mb-2 text-xl text-slate-600" aria-hidden="true">◌</div>
              <p className="text-sm font-bold uppercase tracking-wide text-slate-300">Şu an açık maç odası yok</p>
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {rooms.map((room) => (
                <article key={room.id} className="flex flex-col justify-between gap-4 border border-white/[0.07] bg-[#141c23] p-3 transition hover:border-white/20 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center border border-[#b9e600]/20 bg-[#b9e600]/10 text-xs font-black italic text-[#c9f000]" aria-hidden="true">UT</div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-black uppercase tracking-wide text-white">{room.teamName}</h3>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{room.rosterReady ? <>{room.formation} <span className="px-1 text-slate-700">/</span> OVR {room.teamRating}</> : "Kadro hazırlanıyor"} <span className="px-1 text-slate-700">/</span> {waitingLabel(room.createdAt)}</p>
                    </div>
                  </div>
                  <button onClick={() => void joinWaitingRoom(room)} disabled={joiningId !== null} className="shrink-0 border border-[#c9f000]/30 bg-[#b9e600] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#11170b] transition hover:bg-[#d2ff00] disabled:cursor-wait disabled:opacity-50">
                    {joiningId === room.id ? "Joining…" : "Join match →"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-7 border-t border-white/10 pt-4 text-center text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-600">
          Bu, resmi FIFA/EA Sports ürünü değildir. Yalnızca eğlence amaçlı bir hayran projesidir.
        </footer>
      </div>
    </main>
  );
}

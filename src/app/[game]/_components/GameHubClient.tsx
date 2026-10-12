"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { GameVersion } from "@/lib/types";
import type { OpenRoomSummary } from "@/lib/rooms-store";
import { createRoomAccessToken, saveRoomAccessToken } from "@/lib/room-access";

const GAME_THEME = {
  fifa14: {
    label: "FIFA 14",
    season: "Legacy season",
    hue: "from-[#10201f] via-[#10171c] to-[#0c1117]",
    border: "border-[#00d7b0]/30",
    badge: "bg-[#00d7b0]/10 text-[#00d7b0]",
    button: "bg-[#00d7b0] hover:bg-[#5fffe0]",
    soft: "bg-[#00d7b0]/10 text-[#00d7b0]",
    accent: "text-[#00d7b0]",
  },
  fifa15: {
    label: "FIFA 15",
    season: "New season",
    hue: "from-[#1d2511] via-[#141a13] to-[#0c1117]",
    border: "border-[#c6f000]/30",
    badge: "bg-[#c6f000]/10 text-[#c6f000]",
    button: "bg-[#c6f000] hover:bg-[#ddff3c]",
    soft: "bg-[#c6f000]/10 text-[#c6f000]",
    accent: "text-[#c6f000]",
  },
} satisfies Record<GameVersion, { label: string; season: string; hue: string; border: string; badge: string; button: string; soft: string; accent: string }>;

function waitingLabel(createdAt: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60_000));
  return minutes === 0 ? "Az önce hazırlandı" : `${minutes} dk. rakip bekliyor`;
}

export default function GameHubClient({ game }: { game: GameVersion }) {
  const router = useRouter();
  const theme = GAME_THEME[game];
  const [joinCode, setJoinCode] = useState("");
  const [rooms, setRooms] = useState<OpenRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [creating, setCreating] = useState(false);
  const [quickStarting, setQuickStarting] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refreshRooms = useCallback(async () => {
    try {
      const response = await fetch(`/api/rooms?game=${game}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Bekleyen kadrolar yüklenemedi.");
      const data = await response.json();
      setRooms(data.rooms ?? []);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Odalar şu an alınamıyor.");
    } finally {
      setLoadingRooms(false);
    }
  }, [game]);

  useEffect(() => {
    void refreshRooms();
    const interval = setInterval(() => void refreshRooms(), 5000);
    return () => clearInterval(interval);
  }, [refreshRooms]);

  const joinRoom = async (roomId: string) => {
    const guestAccessToken = createRoomAccessToken();
    const response = await fetch(`/api/rooms/${roomId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestName: "Misafir", guestAccessToken }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Odaya katılınamadı.");
    saveRoomAccessToken(roomId, "guest", guestAccessToken);
    router.push(`/${game}/room/${roomId}?role=guest`);
  };

  const handleCreateRoom = async () => {
    setCreating(true);
    setError("");
    try {
      const hostAccessToken = createRoomAccessToken();
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, hostName: "Ev Sahibi", hostAccessToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Oda açılamadı.");
      saveRoomAccessToken(data.room.id, "host", hostAccessToken);
      router.push(`/${game}/room/${data.room.id}?role=host`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Oda açılamadı.");
      setCreating(false);
    }
  };

  const handleJoinByCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanCode = joinCode.trim().toUpperCase();
    if (!cleanCode) return;
    setError("");
    try {
      const response = await fetch(`/api/rooms/${cleanCode}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Oda bulunamadı.");
      if (data.room.gameVersion !== game) {
        throw new Error(`Bu oda ${data.room.gameVersion === "fifa14" ? "FIFA 14" : "FIFA 15"} için açılmış.`);
      }
      await joinRoom(cleanCode);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Odaya katılınamadı.");
    }
  };

  const handleJoinOpenRoom = async (room: OpenRoomSummary) => {
    setJoiningId(room.id);
    setError("");
    try {
      await joinRoom(room.id);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Odaya katılınamadı.");
      await refreshRooms();
      setJoiningId(null);
    }
  };

  const handleQuickMatch = async () => {
    setQuickStarting(true);
    setError("");
    try {
      const hostAccessToken = createRoomAccessToken();
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, hostName: "Benim Takımım", hostAccessToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Oda oluşturulamadı.");
      saveRoomAccessToken(data.room.id, "host", hostAccessToken);
      const botResponse = await fetch(`/api/rooms/${data.room.id}/bot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomToken: hostAccessToken }),
      });
      if (!botResponse.ok) throw new Error("Hızlı maç şu an başlatılamadı.");
      router.push(`/${game}/room/${data.room.id}?role=host`);
    } catch (quickError) {
      setError(quickError instanceof Error ? quickError.message : "Hızlı maç başlatılamadı.");
      setQuickStarting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070a0e] px-4 py-5 text-white sm:py-7" style={{ backgroundImage: "radial-gradient(ellipse at 80% 0%, rgba(128,170,0,.13), transparent 38%), linear-gradient(180deg,#0b1117 0%,#070a0e 70%)" }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] opacity-[0.06]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 42px, #a5e900 43px 44px), repeating-linear-gradient(90deg, transparent 0 42px, #a5e900 43px 44px)", maskImage: "linear-gradient(to bottom,black,transparent)" }} />
      <div className="relative mx-auto max-w-6xl">
        <nav className="mb-7 flex items-center justify-between border-b border-white/10 pb-4">
          <Link href="/" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 transition hover:text-white"><span>←</span> Oyun seçimi</Link>
          <div className="flex items-center gap-3"><span className={`hidden border-l-2 pl-2 text-[9px] font-black uppercase tracking-[0.18em] sm:inline ${theme.accent}`}>{theme.season}</span><span className={`border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] ${theme.badge} ${theme.border}`}>{theme.label}</span></div>
        </nav>

        <header className={`relative isolate mb-6 overflow-hidden border bg-gradient-to-r p-5 sm:p-7 ${theme.hue} ${theme.border}`}>
          <div className="absolute inset-y-0 right-0 -z-10 flex items-center pr-4 text-[180px] font-black italic leading-none text-white/[0.035]">{game === "fifa14" ? "14" : "15"}</div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className={`mb-2 text-[9px] font-black uppercase tracking-[0.22em] ${theme.accent}`}>EA SPORTS · ULTIMATE TEAM · ÇEVRİMİÇİ</p>
              <h1 className="text-3xl font-black uppercase leading-none tracking-[-0.04em] sm:text-5xl">Maç Merkezi</h1>
            </div>
            <div className="flex items-center gap-2 border border-white/10 bg-black/25 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400"><span className={`h-2 w-2 animate-pulse ${game === "fifa14" ? "bg-[#00d7b0]" : "bg-[#c6f000]"}`} /> Çevrimiçi odalar</div>
          </div>
        </header>

        {error && <p role="status" className="mb-5 border border-rose-900/70 bg-rose-950/50 px-4 py-3 text-sm text-rose-200">{error}</p>}

        <section aria-labelledby="waiting-title" className="mb-6 border border-white/10 bg-[#0e141a] p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className={`mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] ${theme.accent}`}><span className="h-2 w-2 animate-pulse bg-current" /> {theme.label} · Canlı eşleşme</div>
              <h2 id="waiting-title" className="text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">Rakip bekleyen kadrolar</h2>
            </div>
            <button onClick={() => void refreshRooms()} className="self-start border border-white/15 bg-white/[0.04] px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300 transition hover:border-white/30 hover:text-white sm:self-auto">Yenile</button>
          </div>

          {loadingRooms ? (
            <div className="border border-white/5 bg-black/20 px-5 py-7 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Aktif kadrolar aranıyor…</div>
          ) : rooms.length === 0 ? (
            <div className="border border-dashed border-white/10 bg-black/20 px-5 py-7 text-center">
              <div className="mb-2 text-xl text-slate-600" aria-hidden="true">◌</div>
              <p className="text-sm font-bold uppercase tracking-wide text-slate-300">Şu an açık maç odası yok</p>
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {rooms.map((room) => (
                <article key={room.id} className="flex flex-col justify-between gap-4 border border-white/[0.07] bg-[#141c23] p-3 transition hover:border-white/20 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`grid h-11 w-11 shrink-0 place-items-center border text-xs font-black italic ${theme.soft}`} aria-hidden="true">UT</div>
                    <div className="min-w-0"><h3 className="truncate text-sm font-black uppercase tracking-wide text-white">{room.teamName}</h3><p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{room.rosterReady ? <>{room.formation} <span className="px-1 text-slate-700">/</span> OVR {room.teamRating}</> : "Kadro hazırlanıyor"} <span className="px-1 text-slate-700">/</span> {waitingLabel(room.createdAt)}</p></div>
                  </div>
                  <button onClick={() => void handleJoinOpenRoom(room)} disabled={joiningId !== null} className={`shrink-0 border border-current px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#10150b] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-50 ${theme.button}`}>
                    {joiningId === room.id ? "Katılıyor…" : "Maça katıl →"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Match options" className="grid gap-3 md:grid-cols-2">
          <article className="flex flex-col justify-between border border-white/10 bg-[#10171d] p-5 sm:p-6">
            <div><div className={`mb-4 inline-grid h-10 w-10 place-items-center border text-lg ${theme.soft}`}>＋</div><p className="mb-1 text-[9px] font-bold uppercase tracking-[0.19em] text-slate-500">Arkadaşınla oyna</p><h2 className="text-xl font-black uppercase text-white">Yeni oda oluştur</h2></div>
            <button onClick={() => void handleCreateRoom()} disabled={creating} className={`mt-5 border border-current px-4 py-3 text-xs font-black uppercase tracking-[0.13em] text-[#10150b] transition hover:brightness-110 disabled:opacity-60 ${theme.button}`}>{creating ? "Oda açılıyor…" : "Oda oluştur →"}</button>
            <form onSubmit={handleJoinByCode} className="mt-4 flex gap-2 border-t border-white/10 pt-4">
              <label htmlFor="room-code" className="sr-only">Oda kodu</label>
              <input id="room-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={8} placeholder="ODA KODU" className="min-w-0 flex-1 border border-white/10 bg-[#080d12] px-3 py-2.5 text-center font-mono text-sm font-bold tracking-[0.16em] text-white placeholder:text-slate-600 focus:border-white/30 focus:outline-none" />
              <button type="submit" className="border border-white/15 bg-white/[0.06] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300 transition hover:bg-white/10">Katıl</button>
            </form>
          </article>

          <article className="flex flex-col justify-between border border-white/10 bg-gradient-to-br from-[#151d20] to-[#10161b] p-5 sm:p-6">
            <div><div className="mb-4 inline-grid h-10 w-10 place-items-center border border-white/10 bg-white/[0.04] text-lg text-slate-300">▶</div><p className="mb-1 text-[9px] font-bold uppercase tracking-[0.19em] text-slate-500">Tek oyunculu</p><h2 className="text-xl font-black uppercase text-white">Botla ısınma maçı</h2></div>
            <button onClick={() => void handleQuickMatch()} disabled={quickStarting} className="mt-5 border border-white/20 bg-white/[0.06] px-4 py-3 text-xs font-black uppercase tracking-[0.13em] text-white transition hover:border-white/40 hover:bg-white/10 disabled:opacity-60">{quickStarting ? "Maç hazırlanıyor…" : "Botla oyna →"}</button>
          </article>
        </section>

        <Link href={`/${game}/ranked`} className="mt-3 flex items-center justify-between gap-4 border border-[#c6f000]/20 bg-[#c6f000]/[0.04] p-4 transition hover:border-[#c6f000]/50 hover:bg-[#c6f000]/[0.08]">
          <div><p className="mb-1 text-[9px] font-black uppercase tracking-[0.18em] text-[#c6f000]">Rekabetçi</p><h2 className="text-sm font-black uppercase text-white">Ranked Lig</h2></div><span className="text-xl font-bold text-[#c6f000]">→</span>
        </Link>

        <footer className="mt-7 border-t border-white/10 pt-4 text-center text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-600">FIFA {game === "fifa14" ? "14" : "15"} Maç Merkezi · Resmi olmayan hayran projesi</footer>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GameVersion } from "@/lib/types";
import { getRankedProfile, saveRankedProfile, type RankedProfile } from "@/lib/ranked-profile";
import { createRoomAccessToken, saveRoomAccessToken } from "@/lib/room-access";

interface RankRow {
  profile_id: string;
  display_name: string;
  rating: number;
  wins: number;
  draws: number;
  losses: number;
  matches: number;
}

function rankTitle(rating: number) {
  if (rating >= 1850) return "Efsane";
  if (rating >= 1600) return "Elmas";
  if (rating >= 1400) return "Platin";
  if (rating >= 1250) return "Altın";
  if (rating >= 1100) return "Gümüş";
  return "Bronz";
}

export default function RankedPageClient({ game }: { game: GameVersion }) {
  const router = useRouter();
  const [profile, setProfile] = useState<RankedProfile | null>(null);
  const [leaderboard, setLeaderboard] = useState<RankRow[]>([]);
  const [ownProfile, setOwnProfile] = useState<RankRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const refreshLeaderboard = useCallback(async (currentProfile: RankedProfile) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ game, profileId: currentProfile.id });
      const response = await fetch(`/api/ranked/leaderboard?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sıralama yüklenemedi.");
      setLeaderboard(data.leaderboard || []);
      setOwnProfile(data.ownProfile || null);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Sıralama yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [game]);

  useEffect(() => {
    const currentProfile = getRankedProfile();
    // Read the device-local anonymous profile after hydration to avoid an SSR mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(currentProfile);
    void refreshLeaderboard(currentProfile);
  }, [refreshLeaderboard]);

  const updateName = (name: string) => {
    if (!profile) return;
    const next = { ...profile, name: name.slice(0, 32) };
    setProfile(next);
    saveRankedProfile(next);
  };

  const createRankedRoom = async () => {
    if (!profile || !profile.name.trim()) {
      setError("Önce bir teknik direktör adı yaz.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const hostAccessToken = createRoomAccessToken();
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, ranked: true, profileId: profile.id, hostName: profile.name.trim(), hostAccessToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ranked odası açılamadı.");
      saveRoomAccessToken(data.room.id, "host", hostAccessToken);
      router.push(`/${game}/room/${data.room.id}?role=host`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Ranked odası açılamadı.");
      setCreating(false);
    }
  };

  const myRating = ownProfile?.rating ?? 1000;
  const myRank = leaderboard.findIndex((entry) => entry.profile_id === profile?.id);

  return (
    <main className="fifa-interface min-h-screen mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href={`/${game}`} className="rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-xs font-semibold text-stone-300 hover:bg-stone-800">← Geri</Link>
        <span className="rounded-full border border-emerald-900 bg-emerald-950/60 px-3 py-1 text-xs font-bold uppercase tracking-widest text-emerald-300">{game === "fifa14" ? "FIFA 14" : "FIFA 15"}</span>
      </div>

      <header className="mb-6 rounded-3xl border border-amber-900/50 bg-gradient-to-br from-[#29261c] to-[#191a15] p-6 sm:p-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-300/70">Kulüp tahtası</p>
        <h1 className="text-3xl font-black text-amber-50 sm:text-4xl">Ranked Lig</h1>
      </header>

      <section className="mb-6 grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="rounded-2xl border border-stone-800 bg-stone-900/70 p-5">
          <label htmlFor="ranked-name" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-stone-400">Anonim teknik direktör adı</label>
          <input id="ranked-name" value={profile?.name ?? ""} onChange={(event) => updateName(event.target.value)} maxLength={32} placeholder="Örn. Çamlık United" className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2.5 text-sm text-stone-100 placeholder:text-stone-600 focus:border-amber-700 focus:outline-none" />
        </div>
        <div className="flex min-w-48 flex-col justify-center rounded-2xl border border-amber-900/50 bg-amber-950/25 p-5 text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-amber-200/60">{rankTitle(myRating)}</span>
          <strong className="my-1 text-4xl font-black tabular-nums text-amber-100">{myRating}</strong>
          <span className="text-xs text-amber-100/50">{ownProfile ? `${ownProfile.wins}G · ${ownProfile.draws}B · ${ownProfile.losses}M` : "İlk maçını bekliyor"}</span>
        </div>
      </section>

      <button onClick={createRankedRoom} disabled={creating || !profile} className="mb-6 w-full rounded-2xl border border-amber-700/50 bg-amber-800/80 px-5 py-4 text-sm font-bold text-amber-50 shadow-lg shadow-amber-950/20 transition-colors hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60">
        {creating ? "Ranked odası açılıyor…" : "⚔ Ranked maç odası kur · Arkadaşını davet et"}
      </button>

      {error && <div className="mb-5 rounded-xl border border-rose-900/70 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</div>}

      <section className="overflow-hidden rounded-2xl border border-stone-800 bg-stone-900/70">
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
          <div>
            <h2 className="font-bold text-stone-100">Global sıralama</h2>
          </div>
          <button onClick={() => profile && void refreshLeaderboard(profile)} className="rounded-lg border border-stone-700 px-3 py-2 text-xs font-semibold text-stone-300 hover:bg-stone-800">Yenile</button>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-stone-500">Sıralama yükleniyor…</p>
        ) : leaderboard.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-400">Henüz sıralamada oyuncu yok.</p>
        ) : (
          <ol className="divide-y divide-stone-800/80">
            {leaderboard.map((entry, index) => (
              <li key={entry.profile_id} className={`flex items-center gap-4 px-5 py-3 ${entry.profile_id === profile?.id ? "bg-amber-950/20" : ""}`}>
                <span className={`w-8 text-center font-mono text-sm font-bold ${index < 3 ? "text-amber-300" : "text-stone-500"}`}>{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-200">{entry.display_name}{entry.profile_id === profile?.id ? " · Sen" : ""}</span>
                <span className="text-right text-[11px] text-stone-500">{entry.wins}G {entry.draws}B {entry.losses}M</span>
                <strong className="w-14 text-right font-mono text-base text-amber-200">{entry.rating}</strong>
              </li>
            ))}
          </ol>
        )}
        {myRank < 0 && ownProfile && <p className="border-t border-stone-800 px-5 py-3 text-xs text-stone-400">Kendi puanın: {ownProfile.rating} · İlk 100 dışında</p>}
      </section>
      <p className="mt-4 text-center text-[11px] leading-5 text-stone-600">Anonim profil kimliği bu tarayıcıda tutulur. Tarayıcı verilerini silersen profilini geri yükleyemezsin.</p>
    </main>
  );
}

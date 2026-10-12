"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { GameVersion, MatchResult, MatchEvent } from "@/lib/types";
import type { Room } from "@/lib/rooms-store";
import { getAnyRoomAccessToken, getStoredRoomRole, type RoomRole } from "@/lib/room-access";
import { describeEvent } from "@/lib/match-commentary";
import {
  playWhistleSound,
  playGoalSound,
  playPostHitSound,
  playKickSound,
} from "@/lib/sound-effects";

const GAME_THEME = {
  fifa14: { badge: "bg-blue-700 text-blue-200", border: "border-blue-700" },
  fifa15: { badge: "bg-green-700 text-green-200", border: "border-green-700" },
};

function StatBar({
  label,
  home,
  away,
  isPercent = false,
}: {
  label: string;
  home: number;
  away: number;
  isPercent?: boolean;
}) {
  const total = home + away || 1;
  const homePct = Math.round((home / total) * 100);

  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span className="font-bold text-indigo-400">{isPercent ? `${home}%` : home}</span>
        <span className="text-gray-400">{label}</span>
        <span className="font-bold text-rose-400">{isPercent ? `${away}%` : away}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
        <div
          className="bg-indigo-500 transition-all duration-300"
          style={{ width: `${isPercent ? home : homePct}%` }}
        />
        <div
          className="bg-rose-500 flex-1 transition-all duration-300"
          style={{ width: `${isPercent ? away : 100 - homePct}%` }}
        />
      </div>
    </div>
  );
}

export default function MatchLiveRoomClient({
  game,
  roomId,
}: {
  game: GameVersion;
  roomId: string;
}) {
  const router = useRouter();
  const theme = GAME_THEME[game];

  const [room, setRoom] = useState<Room | null>(null);
  const [rematchReady, setRematchReady] = useState({ host: false, guest: false });
  const [participantRole, setParticipantRole] = useState<RoomRole | null>(null);
  const [requestingRematch, setRequestingRematch] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [rankedStatus, setRankedStatus] = useState<"idle" | "saved" | "setup" | "error">("idle");

  // Canlı metin simülasyonu durumu
  const [displayedEvents, setDisplayedEvents] = useState<
    Array<{ minute: number; text: string; type: string; team: string }>
  >([]);
  const [currentMinute, setCurrentMinute] = useState(0);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [matchElapsedSeconds, setMatchElapsedSeconds] = useState(0);

  // Beraberlik ve uzatma oylama durumu
  const [showDrawVoting, setShowDrawVoting] = useState(false);
  const [votingInProgress, setVotingInProgress] = useState(false);
  const [extraTimePhase, setExtraTimePhase] = useState<"none" | "playing" | "done">("none");

  // Son gol animasyonu için durum
  const [goalFlash, setGoalFlash] = useState<string | null>(null);

  const tickerEndRef = useRef<HTMLDivElement | null>(null);
  const eventsTriggeredRef = useRef<Set<number>>(new Set());
  const matchStartedAtRef = useRef<number | null>(null);
  const extraTimeStartedRef = useRef<string | null>(null);
  const extraTimeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundEnabledRef = useRef(true);
  soundEnabledRef.current = soundEnabled;

  useEffect(() => {
    setParticipantRole(getStoredRoomRole(roomId));
  }, [roomId]);

  useEffect(() => () => {
    if (extraTimeIntervalRef.current) clearInterval(extraTimeIntervalRef.current);
  }, []);

  const startExtraTime = useCallback((updatedResult: MatchResult) => {
    if (!updatedResult.extraTimeMode) return;
    const startKey = `${matchStartedAtRef.current}:${updatedResult.extraTimeMode}`;
    if (extraTimeStartedRef.current === startKey) return;
    extraTimeStartedRef.current = startKey;

    if (extraTimeIntervalRef.current) clearInterval(extraTimeIntervalRef.current);
    setResult(updatedResult);
    setShowDrawVoting(false);
    setExtraTimePhase("playing");

    const labels = {
      home: room?.host.roster?.teamName || "Ev Sahibi",
      away: room?.guest?.roster?.teamName || "Misafir",
    };
    const extraEvents = updatedResult.events
      .filter((event) => event.minute > 90 || event.type.startsWith("penalty"))
      .map((event) => ({
        minute: event.minute,
        text: describeEvent(event, labels),
        type: event.type,
        team: event.team,
        playerName: event.playerName,
      }));

    let index = 0;
    if (soundEnabledRef.current) playWhistleSound();
    extraTimeIntervalRef.current = setInterval(() => {
      if (index >= extraEvents.length) {
        if (extraTimeIntervalRef.current) clearInterval(extraTimeIntervalRef.current);
        extraTimeIntervalRef.current = null;
        setIsFinished(true);
        setExtraTimePhase("done");
        if (soundEnabledRef.current) playWhistleSound();
        return;
      }

      const event = extraEvents[index++];
      setCurrentMinute(event.minute);
      setDisplayedEvents((previous) => [...previous, event]);
      if (event.type === "goal" || event.type === "golden_goal") {
        if (event.team === "home") setHomeScore((score) => score + 1);
        else setAwayScore((score) => score + 1);
        if (soundEnabledRef.current) playGoalSound();
        setGoalFlash(event.playerName || "ALTIN GOL!");
        setTimeout(() => setGoalFlash(null), 4000);
      } else if (event.type === "penalty_shootout_kick" && soundEnabledRef.current) {
        playKickSound();
      }
    }, 1200);
  }, [room?.host.roster?.teamName, room?.guest?.roster?.teamName]);

  const syncRoomUpdate = useCallback((incoming: Room) => {
    const nextRoom: Room = {
      ...incoming,
      rematchReady: incoming.rematchReady ?? { host: false, guest: false },
    };
    const previousStartedAt = matchStartedAtRef.current;
    const isNewMatch = previousStartedAt !== null && nextRoom.matchStartedAt !== previousStartedAt;
    matchStartedAtRef.current = nextRoom.matchStartedAt;
    setRematchReady(nextRoom.rematchReady);

    if (previousStartedAt === null || isNewMatch) {
      setRoom(nextRoom);
      setResult(nextRoom.matchResult);
    }

    if (!isNewMatch && nextRoom.matchResult?.extraTimeMode) {
      if (previousStartedAt === null) {
        setHomeScore(nextRoom.matchResult.regularHomeScore);
        setAwayScore(nextRoom.matchResult.regularAwayScore);
      }
      startExtraTime(nextRoom.matchResult);
    }

    if (isNewMatch) {
      if (extraTimeIntervalRef.current) clearInterval(extraTimeIntervalRef.current);
      extraTimeIntervalRef.current = null;
      extraTimeStartedRef.current = null;
      setDisplayedEvents([]);
      setCurrentMinute(0);
      setHomeScore(0);
      setAwayScore(0);
      setIsFinished(false);
      setShowDrawVoting(false);
      setExtraTimePhase("none");
      setMatchElapsedSeconds(0);
      setRankedStatus("idle");
      setRematchError(null);
    }
  }, [startExtraTime]);

  // 1. Odayı ve maçı çek
  const fetchRoomData = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}`);
      if (!res.ok) {
        router.push(`/${game}`);
        return;
      }
      const data = await res.json();
      syncRoomUpdate(data.room as Room);
    } catch (err) {
      console.error("Maç çekilemedi:", err);
    } finally {
      setLoading(false);
    }
  }, [roomId, game, router, syncRoomUpdate]);

  useEffect(() => {
    if (!isFinished || !room?.ranked) return;
    let cancelled = false;
    fetch(`/api/rooms/${roomId}/ranked`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomToken: getAnyRoomAccessToken(roomId) }),
    })
      .then(async (rankRes) => {
        const rankData = await rankRes.json();
        if (cancelled) return;
        setRankedStatus(rankRes.ok ? "saved" : rankData.configured === false ? "setup" : "error");
        if (!rankRes.ok) console.error("Ranked sonucu kaydedilemedi:", rankData.error);
      })
      .catch(() => { if (!cancelled) setRankedStatus("error"); });
    return () => { cancelled = true; };
  }, [isFinished, room?.ranked, roomId]);

  useEffect(() => {
    fetchRoomData();
  }, [fetchRoomData]);

  useEffect(() => {
    if (!isFinished && !showDrawVoting) return;
    const interval = setInterval(() => void fetchRoomData(), 1500);
    return () => clearInterval(interval);
  }, [isFinished, showDrawVoting, fetchRoomData]);

  // Tüm olayların metinlerini oluştur
  const formatAllEvents = useCallback(() => {
    if (!result || !room?.host.roster || !room?.guest?.roster) return [];
    const labels = {
      home: room.host.roster.teamName || "Ev Sahibi",
      away: room.guest.roster.teamName || "Misafir",
    };

    return result.events.map((e: MatchEvent) => ({
      minute: e.minute,
      text: describeEvent(e, labels),
      type: e.type,
      team: e.team,
      playerName: e.playerName,
      secondaryPlayerName: e.secondaryPlayerName,
    }));
  }, [result, room]);

  // 2. 60 Saniyelik Kesin Zamanlayıcı (Maç tam 1 dakika sürer)
  useEffect(() => {
    if (!result || !room || extraTimePhase !== "none") return;

    eventsTriggeredRef.current = new Set();
    const allFormatted = formatAllEvents();
    if (allFormatted.length === 0) return;

    // Normal süre olayları (0 - 90 dakika)
    const regularEvents = allFormatted.filter((e) => e.minute <= 90);

    const MATCH_DURATION_MS = 60000; // Tam 60 saniye (1 dakika)
    const START_TIME = Date.now();

    if (soundEnabledRef.current) {
      playWhistleSound();
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - START_TIME;
      const progress = Math.min(1, elapsed / MATCH_DURATION_MS);
      const simulatedMinute = Math.min(90, Math.floor(progress * 90));

      setMatchElapsedSeconds(Math.floor(elapsed / 1000));
      setCurrentMinute(simulatedMinute);

      // Bu dakikaya kadar tetiklenmemiş olayları ekle
      regularEvents.forEach((ev, idx) => {
        // Her olayın gerçekleştiği tahmini saniye
        const targetMs = (ev.minute / 90) * (MATCH_DURATION_MS - 2000);
        if (elapsed >= targetMs && !eventsTriggeredRef.current.has(idx)) {
          eventsTriggeredRef.current.add(idx);

          setDisplayedEvents((prev) => [...prev, ev]);

          // Gol durumunda skor artışı ve ses
          if (ev.type === "goal") {
            if (ev.team === "home") setHomeScore((s) => s + 1);
            else setAwayScore((s) => s + 1);

            if (soundEnabledRef.current) playGoalSound();
            setGoalFlash(ev.playerName || "GOL!");
            setTimeout(() => setGoalFlash(null), 3500);
          } else if (ev.type === "miss") {
            if (soundEnabledRef.current) playPostHitSound();
          } else if (ev.type === "shot" || ev.type === "save") {
            if (soundEnabledRef.current) playKickSound();
          } else if (ev.type === "half_time") {
            if (soundEnabledRef.current) playWhistleSound();
          }
        }
      });

      // 60 saniye doldu (90. dakika bitti)
      if (elapsed >= MATCH_DURATION_MS) {
        clearInterval(interval);
        if (soundEnabledRef.current) playWhistleSound();

        // Skor eşit mi?
        const isTie = result.regularHomeScore === result.regularAwayScore;
        if (isTie && !result.extraTimeMode) {
          setShowDrawVoting(true);
        } else {
          setIsFinished(true);
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [result, room, extraTimePhase, formatAllEvents]);

  // Yeni olay geldiğinde otomatik kaydır
  useEffect(() => {
    tickerEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedEvents]);

  // 3. Uzatma & Altın Gol Oylaması
  const handleVoteExtraTime = async (mode: "golden_goal" | "classic") => {
    setVotingInProgress(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/extratime`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, roomToken: getAnyRoomAccessToken(roomId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Uzatma başlatılamadı.");
      syncRoomUpdate(data.room as Room);
    } catch (err) {
      console.error("Uzatma hatası:", err);
    } finally {
      setVotingInProgress(false);
    }
  };

  // 4. Rövanş Başlat (Tamamen Yeni Maç)
  const handleRematch = async (action: "ready" | "cancel" = "ready") => {
    if (requestingRematch) return;
    if (action === "ready" && participantRole && rematchReady[participantRole]) return;
    if (action === "cancel" && (!participantRole || !rematchReady[participantRole])) return;
    setRequestingRematch(true);
    setRematchError(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/rematch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, roomToken: getAnyRoomAccessToken(roomId) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRematchError(data.error || "Rövanş onayı gönderilemedi.");
        return;
      }
      if (data.room) syncRoomUpdate(data.room as Room);
    } catch (e) {
      console.error("Rövanş başlatılamadı:", e);
      setRematchError("Bağlantı kurulamadı. Tekrar deneyebilirsin.");
    } finally {
      setRequestingRematch(false);
    }
  };

  if (loading || !room || !result) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        <div className="animate-pulse">Maç simülasyonu yükleniyor...</div>
      </div>
    );
  }

  const hostTeam = room.host.roster?.teamName || "Ev Sahibi";
  const guestTeam = room.guest?.roster?.teamName || "Misafir";
  const stats = result.statistics;

  return (
    <main className="fifa-interface min-h-screen max-w-6xl mx-auto px-4 py-8">
      {/* Gol Kutlama Ekran Flaş Vurgusu */}
      {goalFlash && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center bg-yellow-500/10 backdrop-blur-[2px] transition-all animate-pulse">
          <div className="rounded-3xl bg-gradient-to-r from-amber-600 to-yellow-500 p-8 text-black text-center shadow-2xl scale-110 transform transition-transform">
            <div className="text-4xl mb-2">⚽ GOOOOOLLL! ⚽</div>
            <div className="text-2xl font-black">{goalFlash}</div>
          </div>
        </div>
      )}

      {/* Üst Çubuk: Geri Dön & Ses Kontrolü */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-950/60 bg-[#171713] px-4 py-3 shadow-lg shadow-black/10">
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={`/${game}`}
            className="rounded-xl border border-stone-700/70 bg-stone-800/70 px-3.5 py-2 text-xs font-semibold text-stone-200 transition-colors hover:border-amber-700/60 hover:bg-stone-700/80 hover:text-amber-100"
          >
            ← Ana Ekrana Dön
          </a>
          <span className="rounded-full border border-emerald-800/70 bg-emerald-950/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-300">
            {game === "fifa14" ? "FIFA 14" : "FIFA 15"}
          </span>
          <span className="rounded-full border border-stone-800 bg-[#100f0c] px-3 py-1.5 text-[11px] text-stone-400">
            <span className="mr-1.5 text-stone-600">Oda</span>
            <span className="font-mono tracking-wide text-stone-300">{roomId}</span>
          </span>
          {room.ranked && (
            <span className="rounded-full border border-amber-900/70 bg-amber-950/40 px-2.5 py-1 text-[10px] font-semibold text-amber-300">
              {rankedStatus === "saved" ? "Sıralamaya işlendi" : rankedStatus === "setup" ? "Sıralama kurulumu gerekli" : rankedStatus === "error" ? "Sıralama kaydedilemedi" : "Ranked maç"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Ses Aç / Kapa Butonu */}
          <button
            onClick={() => setSoundEnabled((s) => !s)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              soundEnabled
                ? "border-emerald-900/80 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-950"
                : "border-stone-700 bg-stone-800/70 text-stone-400 hover:bg-stone-800"
            }`}
          >
            {soundEnabled ? "🔊 Stadyum Sesi Açık" : "🔇 Sessiz"}
          </button>

          {isFinished ? (
            <span className="rounded-full border border-amber-900/70 bg-amber-950/40 px-3 py-1.5 text-xs font-semibold text-amber-300">
              🏁 Maç bitti
            </span>
          ) : (
            <span className="flex items-center gap-2 rounded-full border border-rose-900/60 bg-rose-950/35 px-3 py-1.5 text-xs font-semibold text-rose-200">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.45)]"></span>
              Canlı · {currentMinute}&apos;
            </span>
          )}
        </div>
      </div>

      {/* Büyük Skor Panosu */}
      <div className="rounded-3xl bg-gradient-to-b from-gray-900 via-gray-900/90 to-gray-950 border border-gray-800 p-6 sm:p-8 mb-6 shadow-2xl relative overflow-hidden">
        {/* 60 Saniyelik İlerleme Çubuğu */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gray-800">
          <div
            className="h-full bg-gradient-to-r from-yellow-500 to-amber-500 transition-all duration-300"
            style={{ width: `${Math.min(100, (matchElapsedSeconds / 60) * 100)}%` }}
          />
        </div>

        <div className="flex items-center justify-between max-w-3xl mx-auto">
          {/* Ev Sahibi */}
          <div className="flex-1 text-right">
            <h2 className="text-xl sm:text-3xl font-black text-indigo-300 truncate">{hostTeam}</h2>
            <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">
              {room.host.roster?.formation || "4-4-2"} · Ev Sahibi
            </p>
          </div>

          {/* Skor & Dakika */}
          <div className="flex flex-col items-center px-6 sm:px-12">
            <div className="text-5xl sm:text-7xl font-black tabular-nums text-white tracking-tight">
              {homeScore} <span className="text-gray-600 font-light">:</span> {awayScore}
            </div>
            {result.penaltyShootout && (
              <div className="text-xs font-bold text-yellow-400 mt-1">
                (Penaltılar: {result.penaltyShootout.homeScore} - {result.penaltyShootout.awayScore})
              </div>
            )}
            <div className="mt-2 rounded-full bg-gray-800/90 px-4 py-1 text-xs font-mono text-yellow-400 font-bold border border-gray-700 flex items-center gap-2">
              <span>{isFinished ? "MAÇ SONU" : `${currentMinute}'`}</span>
              <span className="text-gray-500 font-normal">| {matchElapsedSeconds}s / 60s</span>
            </div>
          </div>

          {/* Misafir */}
          <div className="flex-1 text-left">
            <h2 className="text-xl sm:text-3xl font-black text-rose-300 truncate">{guestTeam}</h2>
            <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">
              {room.guest?.roster?.formation || "4-4-2"} · Misafir
            </p>
          </div>
        </div>
      </div>

      {/* BERABERLİK DURUMU: UZATMA / ALTIN GOL OYLAMA MODALI */}
      {showDrawVoting && (
        <div className="mb-6 p-6 rounded-3xl bg-gradient-to-r from-indigo-950 via-purple-950 to-gray-900 border-2 border-yellow-500/80 shadow-2xl animate-fade-in text-center">
          <div className="text-3xl mb-2">⚖️ 90 DAKİKA BERABERE BİTTİ! ({homeScore} - {awayScore})</div>
          <h3 className="text-xl font-black text-white mb-2">Nasıl Devam Edilsin?</h3>
          <p className="text-xs text-gray-300 max-w-md mx-auto mb-6">
            İki taraftan biri seçim yaptığında maç hemen seçilen kuralla uzatmalara taşınacak:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
            {/* Altın Gol Seçeneği */}
            <button
              onClick={() => handleVoteExtraTime("golden_goal")}
              disabled={votingInProgress}
              className="p-5 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/80 transition-all hover:scale-105 text-left group"
            >
              <div className="text-2xl mb-1">🥇 Altın Gol</div>
              <div className="text-sm font-bold text-amber-300 mb-1">İlk Golü Atan Kazanır!</div>
              <div className="text-xs text-gray-400">
                Uzatmalarda ilk golü atan takım maçı anında bitirir. Gol olmazsa penaltılara gidilir.
              </div>
            </button>

            {/* Klasik Uzatmalar & Penaltılar */}
            <button
              onClick={() => handleVoteExtraTime("classic")}
              disabled={votingInProgress}
              className="p-5 rounded-2xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/80 transition-all hover:scale-105 text-left group"
            >
              <div className="text-2xl mb-1">⏱️ Klasik Uzatmalar</div>
              <div className="text-sm font-bold text-purple-300 mb-1">15+15 Dk & Penaltılar</div>
              <div className="text-xs text-gray-400">
                120 dakika tam oynanır. Beraberlik bozulmazsa seri penaltı atışlarına geçilir!
              </div>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kısa maç olay akışı */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-5 shadow-xl flex flex-col h-[520px]">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-800">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping"></span>
                ⚽ Canlı Maç Akışı
              </h3>
              <span className="text-xs text-gray-500 font-mono">{displayedEvents.length} Olay Kaydı</span>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-2.5">
              {displayedEvents.length === 0 && (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm italic">
                  Maç başlamak üzere... Hakem düdüğü çalıyor!
                </div>
              )}

              {displayedEvents.map((ev, i) => {
                const isGoal = ev.type === "goal" || ev.type === "golden_goal";
                const isCard = ev.type === "yellow_card" || ev.type === "red_card";
                const isSave = ev.type === "save";
                const isPenalty = ev.type.startsWith("penalty_shootout");

                let cardStyle = "bg-gray-950/70 border-gray-800/80 text-gray-300";
                if (isGoal) {
                  cardStyle =
                    "bg-gradient-to-r from-amber-950/80 via-yellow-950/50 to-amber-950/80 border-yellow-500 text-yellow-100 font-bold shadow-lg shadow-yellow-950/60 scale-[1.01]";
                } else if (isCard) {
                  cardStyle = "bg-rose-950/40 border-rose-700/80 text-rose-200 font-semibold";
                } else if (isSave) {
                  cardStyle = "bg-cyan-950/40 border-cyan-700/80 text-cyan-200";
                } else if (isPenalty) {
                  cardStyle = "bg-purple-950/40 border-purple-700/80 text-purple-200 font-bold";
                }

                return (
                  <div
                    key={i}
                    className={`p-3.5 rounded-xl border text-sm transition-all duration-300 ${cardStyle}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`shrink-0 rounded-md px-2 py-1 font-mono text-xs font-bold ${isGoal ? "bg-yellow-400/15 text-yellow-300" : "bg-gray-800 text-gray-400"}`}>
                        {ev.minute}&apos;
                      </span>
                      <span>{ev.text}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={tickerEndRef} />
            </div>
          </div>
        </div>

        {/* Canlı İstatistikler Paneli */}
        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-5 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 pb-2 border-b border-gray-800">
              📊 Canlı İstatistikler
            </h3>

            <div className="flex justify-between text-xs text-gray-400 mb-5 font-bold">
              <span className="text-indigo-400">{hostTeam}</span>
              <span className="text-rose-400">{guestTeam}</span>
            </div>

            <StatBar label="Top Hakimiyeti" home={stats.home.possession} away={stats.away.possession} isPercent />
            <StatBar label="Toplam Şut" home={stats.home.shots} away={stats.away.shots} />
            <StatBar label="İsabetli Şut" home={stats.home.shotsOnTarget} away={stats.away.shotsOnTarget} />
            <StatBar label="Kaleci Kurtarışları" home={stats.home.saves} away={stats.away.saves} />
            <StatBar label="Köşe Vuruşu" home={stats.home.corners} away={stats.away.corners} />
            <StatBar label="Fauller" home={stats.home.fouls} away={stats.away.fouls} />
            <StatBar label="Sarı Kart" home={stats.home.yellowCards} away={stats.away.yellowCards} />
            <StatBar label="Kırmızı Kart" home={stats.home.redCards} away={stats.away.redCards} />

            <div className="mt-4 pt-3 border-t border-gray-800/80">
              <div className="flex justify-between text-xs text-gray-400">
                <span className="font-bold text-indigo-400">{stats.home.xG.toFixed(2)}</span>
                <span className="text-gray-500">xG (Gol Beklentisi)</span>
                <span className="font-bold text-rose-400">{stats.away.xG.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Maç Sonu Eylemleri */}
          {isFinished && (
            <div className="mt-6 pt-4 border-t border-gray-800 text-center space-y-2.5">
              {participantRole && rematchReady[participantRole] ? (
                <>
                  <p className="text-xs text-gray-400">Rövanş onayın alındı. Rakibin onayı bekleniyor.</p>
                  <button
                    onClick={() => void handleRematch("cancel")}
                    disabled={requestingRematch}
                    className="w-full rounded-xl border border-gray-700 bg-gray-800 hover:bg-gray-700 disabled:opacity-60 py-2.5 text-xs font-semibold text-gray-200 transition-colors"
                  >
                    {requestingRematch ? "İşleniyor…" : "Onayımı geri çek"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void handleRematch("ready")}
                  disabled={requestingRematch}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:cursor-wait disabled:opacity-60 py-3 text-xs font-bold text-white transition-all shadow-lg hover:scale-[1.02]"
                >
                  {requestingRematch ? "Onay gönderiliyor…" : "🔄 Rövanş için hazırım"}
                </button>
              )}
              {participantRole
                && !rematchReady[participantRole]
                && rematchReady[participantRole === "host" ? "guest" : "host"] && (
                  <p className="text-xs text-gray-400">Rakibin rövanş için hazır. Başlatmak için sen de onayla.</p>
                )}
              {rematchError && <p role="alert" className="text-xs text-rose-300">{rematchError}</p>}
              <a
                href={`/${game}`}
                className="block w-full rounded-xl bg-gray-800 hover:bg-gray-700 py-2.5 text-xs font-medium text-gray-300 transition-colors"
              >
                🎮 Yeni Karşılaşma Kur
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

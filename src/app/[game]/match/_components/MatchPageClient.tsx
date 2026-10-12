"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { GameVersion, Roster, MatchResult, MatchEvent } from "@/lib/types";
import { simulateMatch } from "@/lib/match-engine";
import { getSimConfig } from "@/lib/sim-config";
import { describeEvent } from "@/lib/match-commentary";

// ─── Oyun teması ──────────────────────────────────────────────────────────────

const GAME_THEME = {
  fifa14: { accent: "blue", badge: "bg-blue-700 text-blue-200", goalBg: "bg-blue-900/40" },
  fifa15: { accent: "green", badge: "bg-green-700 text-green-200", goalBg: "bg-green-900/40" },
};

// ─── İstatistik çubuğu ───────────────────────────────────────────────────────

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
        <span className="font-bold text-white">{isPercent ? `${home}%` : home}</span>
        <span className="text-gray-500">{label}</span>
        <span className="font-bold text-white">{isPercent ? `${away}%` : away}</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden flex">
        <div
          className="bg-indigo-500 transition-all duration-500"
          style={{ width: `${isPercent ? home : homePct}%` }}
        />
        <div
          className="bg-rose-500 flex-1 transition-all duration-500"
          style={{ width: `${isPercent ? away : 100 - homePct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Olay satırı ─────────────────────────────────────────────────────────────

function EventRow({ line, minute, type }: { line: string; minute: number; type: string }) {
  const isGoal = type === "goal" || type === "golden_goal";
  const isCard = type === "yellow_card" || type === "red_card";
  const isChance = type === "shot" || type === "save" || type === "miss" || type === "attack";
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-3 mb-2 transition-all ${
        isGoal
          ? "border-amber-500/50 bg-amber-500/10 text-amber-100 font-semibold"
          : isCard
            ? "border-rose-900/70 bg-rose-950/30 text-rose-200"
            : isChance
              ? "border-sky-900/60 bg-sky-950/20 text-gray-200"
              : "border-gray-800 bg-gray-950/50 text-gray-300"
      }`}
    >
      <span className={`shrink-0 rounded-md px-2 py-1 font-mono text-xs font-bold ${isGoal ? "bg-amber-400/15 text-amber-300" : "bg-gray-800 text-gray-400"}`}>
        {minute}&apos;
      </span>
      <span className="text-sm leading-5">{line}</span>
    </div>
  );
}

// ─── Skor panosu ─────────────────────────────────────────────────────────────

function Scoreboard({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  minute,
  done,
}: {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  done: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-6 py-6 bg-gray-900 rounded-2xl mb-6">
      <div className="text-right flex-1">
        <p className="text-lg font-bold text-indigo-300 truncate">{homeTeam}</p>
        <p className="text-xs text-gray-500 uppercase tracking-wider">Ev Sahibi</p>
      </div>
      <div className="flex flex-col items-center">
        <div className="text-5xl font-black tabular-nums text-white">
          {homeScore} <span className="text-gray-600">–</span> {awayScore}
        </div>
        <div className="mt-1 rounded-full bg-gray-800 px-3 py-0.5 text-xs font-mono text-gray-400">
          {done ? "MAÇ SONA ERDİ" : `${minute}'`}
        </div>
      </div>
      <div className="text-left flex-1">
        <p className="text-lg font-bold text-rose-300 truncate">{awayTeam}</p>
        <p className="text-xs text-gray-500 uppercase tracking-wider">Misafir</p>
      </div>
    </div>
  );
}

// ─── Maç ekranı istemci bileşeni ─────────────────────────────────────────────

export default function MatchPageClient({ game }: { game: GameVersion }) {
  const router = useRouter();
  const theme = GAME_THEME[game];

  const [homeRoster, setHomeRoster] = useState<Roster | null>(null);
  const [awayRoster, setAwayRoster] = useState<Roster | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);

  // Oynatma durumu
  const [displayedLines, setDisplayedLines] = useState<Array<{ line: string; minute: number; type: string }>>([]);
  const [currentMinute, setCurrentMinute] = useState(0);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [done, setDone] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1); // 1x, 2x, 4x

  const eventIndexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const linesEndRef = useRef<HTMLDivElement | null>(null);

  // sessionStorage'dan kadroları yükle
  useEffect(() => {
    try {
      const h = sessionStorage.getItem("homeRoster");
      const a = sessionStorage.getItem("awayRoster");
      if (!h || !a) {
        router.push(`/${game}`);
        return;
      }
      const hr: Roster = JSON.parse(h);
      const ar: Roster = JSON.parse(a);
      setHomeRoster(hr);
      setAwayRoster(ar);

      const config = getSimConfig(game);
      const matchResult = simulateMatch(hr, ar, config);
      setResult(matchResult);
    } catch {
      router.push(`/${game}`);
    }
  }, [game, router]);

  // Olay anlatımı
  const describeAll = useCallback(
    (events: MatchEvent[]) => {
      if (!homeRoster || !awayRoster) return [];
      const labels = { home: homeRoster.teamName || "Ev Sahibi", away: awayRoster.teamName || "Misafir" };
      return events.map((e) => ({
        line: describeEvent(e, labels),
        minute: e.minute,
        score:
          e.type === "goal"
            ? { team: e.team }
            : null,
        eventType: e.type,
      }));
    },
    [homeRoster, awayRoster]
  );

  // Oynatma döngüsü
  useEffect(() => {
    if (!result || !homeRoster || !awayRoster) return;

    const allLines = describeAll(result.events);
    if (allLines.length === 0) return;

    const tickMs = Math.max(80, 400 / speed);

    const tick = () => {
      if (eventIndexRef.current >= allLines.length) {
        setDone(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      const item = allLines[eventIndexRef.current];
      eventIndexRef.current++;

      setCurrentMinute(item.minute);
      setDisplayedLines((prev) => [...prev, { line: item.line, minute: item.minute, type: item.eventType }]);

      if (item.score) {
        if (item.score.team === "home") setHomeScore((s) => s + 1);
        else setAwayScore((s) => s + 1);
      }
    };

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!paused) {
      intervalRef.current = setInterval(tick, tickMs);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [result, homeRoster, awayRoster, paused, speed, describeAll]);

  // Otomatik scroll
  useEffect(() => {
    linesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedLines]);

  const handleSkipToEnd = () => {
    if (!result || !homeRoster || !awayRoster) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    const allLines = describeAll(result.events);
    setDisplayedLines(allLines.map((l) => ({ line: l.line, minute: l.minute, type: l.eventType })));
    setCurrentMinute(90);
    setHomeScore(result.homeScore);
    setAwayScore(result.awayScore);
    setDone(true);
    eventIndexRef.current = allLines.length;
  };

  if (!result || !homeRoster || !awayRoster) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400 animate-pulse text-lg">Simülasyon hazırlanıyor…</div>
      </div>
    );
  }

  const stats = result.statistics;

  return (
    <main className="fifa-interface min-h-screen max-w-5xl mx-auto px-4 py-8">
      {/* Geri */}
      <div className="flex items-center gap-4 mb-6">
        <a href={`/${game}`} className="text-gray-500 hover:text-white text-sm">← Kadroya Dön</a>
        <span className={`rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-widest ${theme.badge}`}>
          {game === "fifa14" ? "FIFA 14" : "FIFA 15"}
        </span>
      </div>

      {/* Skor panosu */}
      <Scoreboard
        homeTeam={homeRoster.teamName || "Ev Sahibi"}
        awayTeam={awayRoster.teamName || "Misafir"}
        homeScore={homeScore}
        awayScore={awayScore}
        minute={currentMinute}
        done={done}
      />

      {/* Kontroller */}
      {!done && (
        <div className="flex items-center gap-3 mb-6 justify-center">
          <button
            onClick={() => setPaused((p) => !p)}
            className="rounded-full bg-gray-800 hover:bg-gray-700 px-5 py-2 text-sm font-semibold text-white transition-colors"
          >
            {paused ? "▶ Devam" : "⏸ Duraklat"}
          </button>
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                speed === s
                  ? "bg-white text-black"
                  : "bg-gray-800 hover:bg-gray-700 text-white"
              }`}
            >
              {s}×
            </button>
          ))}
          <button
            onClick={handleSkipToEnd}
            className="rounded-full bg-gray-800 hover:bg-gray-700 px-5 py-2 text-sm font-semibold text-gray-400 transition-colors"
          >
            ⏭ Sona Atla
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Olay akışı */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4 h-[480px] overflow-y-auto">
            <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center justify-between border-b border-gray-800 bg-gray-900 px-1 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Maç Akışı</h3>
              <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {done ? "Maç tamamlandı" : "Canlı simülasyon"}
              </span>
            </div>
            {displayedLines.length === 0 && (
              <div className="flex h-[360px] items-center justify-center text-sm text-gray-500">
                Santra bekleniyor…
              </div>
            )}
            {displayedLines.map((item, i) => (
              <EventRow key={i} line={item.line} minute={item.minute} type={item.type} />
            ))}
            <div ref={linesEndRef} />
          </div>
        </div>

        {/* İstatistikler */}
        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">İstatistikler</h3>
          <div className="text-center flex gap-6 justify-center text-xs text-gray-500 mb-4">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
              {homeRoster.teamName || "Ev"}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />
              {awayRoster.teamName || "Misafir"}
            </span>
          </div>
          <StatBar label="Top Hakimiyeti" home={stats.home.possession} away={stats.away.possession} isPercent />
          <StatBar label="Şut" home={stats.home.shots} away={stats.away.shots} />
          <StatBar label="İsabetli Şut" home={stats.home.shotsOnTarget} away={stats.away.shotsOnTarget} />
          <StatBar label="Kurtarış" home={stats.home.saves} away={stats.away.saves} />
          <StatBar label="Korner" home={stats.home.corners} away={stats.away.corners} />
          <StatBar label="Faul" home={stats.home.fouls} away={stats.away.fouls} />
          <StatBar label="Sarı Kart" home={stats.home.yellowCards} away={stats.away.yellowCards} />
          <StatBar label="Kırmızı Kart" home={stats.home.redCards} away={stats.away.redCards} />
          <div className="mt-4 pt-4 border-t border-gray-800">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{stats.home.xG.toFixed(2)}</span>
              <span>xG (Beklenen Gol)</span>
              <span>{stats.away.xG.toFixed(2)}</span>
            </div>
          </div>
          {done && (
            <div className="mt-4 pt-4 border-t border-gray-800 text-center">
              <p className="text-xs text-gray-500 mb-3">Seed: {result.seed}</p>
              <a
                href={`/${game}`}
                className="block rounded-full bg-gray-800 hover:bg-gray-700 py-2 text-sm font-semibold text-white transition-colors"
              >
                🔄 Yeniden Oyna
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

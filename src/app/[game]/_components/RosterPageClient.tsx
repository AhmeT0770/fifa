"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { GameVersion, Player, Position, Roster } from "@/lib/types";
import { MAX_ROSTER_IMAGE_BYTES } from "@/lib/image-upload";
import { validateRoster, fillMissingAttributes } from "@/lib/roster-validator";
import SavedTeamsPanel from "./SavedTeamsPanel";

let _idCounter = 0;
function genId() {
  return `p-${++_idCounter}`;
}

// ─── Pozisyon grupları ────────────────────────────────────────────────────────

const POSITIONS: Position[] = [
  "GK",
  "CB", "LB", "RB", "LWB", "RWB",
  "CDM", "CM", "CAM", "LM", "RM",
  "LW", "RW", "CF", "ST",
];

const FORMATIONS = [
  "4-4-2", "4-3-3", "4-2-3-1", "4-5-1",
  "3-5-2", "3-4-3", "5-3-2", "5-4-1",
  "4-1-2-1-2", "4-3-2-1",
];

// ─── FIFA 14/15'e göre varsayılan 11 oyuncu ──────────────────────────────────

function defaultPlayer(i: number, position: Position): Player {
  return {
    id: genId(),
    name: "",
    position,
    overall: 75,
    attributes: {
      pace: null,
      shooting: null,
      passing: null,
      dribbling: null,
      defending: null,
      physical: null,
    },
    confidence: 1,
    source: "manual",
  };
}

const DEFAULT_POSITIONS_442: Position[] = [
  "GK",
  "RB", "CB", "CB", "LB",
  "RM", "CM", "CM", "LM",
  "ST", "ST",
];

function emptyRoster(gameVersion: GameVersion): Roster {
  return {
    teamName: "",
    formation: "4-4-2",
    players: DEFAULT_POSITIONS_442.map((pos, i) => defaultPlayer(i, pos)),
    gameVersion,
  };
}

// ─── Renk şeması oyuna göre ──────────────────────────────────────────────────

const GAME_THEME = {
  fifa14: {
    accent: "blue",
    border: "border-blue-700",
    bg: "bg-blue-950/60",
    cardBg: "bg-blue-900/40",
    button: "bg-blue-600 hover:bg-blue-500",
    label: "FIFA 14",
    badge: "bg-blue-700 text-blue-200",
  },
  fifa15: {
    accent: "green",
    border: "border-green-700",
    bg: "bg-green-950/60",
    cardBg: "bg-green-900/40",
    button: "bg-green-600 hover:bg-green-500",
    label: "FIFA 15",
    badge: "bg-green-700 text-green-200",
  },
};

// ─── Oyuncu satır bileşeni ────────────────────────────────────────────────────

interface PlayerRowProps {
  player: Player;
  index: number;
  onChange: (index: number, field: keyof Player | `attr.${string}`, value: unknown) => void;
  game: GameVersion;
}

function PlayerRow({ player, index, onChange }: PlayerRowProps) {
  const getConfidenceBadge = () => {
    if (player.source !== "image") return null;
    const conf = player.confidence;
    const pct = Math.round(conf * 100);
    if (conf >= 0.8) {
      return (
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800" title="Yüksek Güven">
          AI %{pct}
        </span>
      );
    }
    if (conf >= 0.5) {
      return (
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800" title="Orta Güven - Kontrol edin">
          AI %{pct} ⚠
        </span>
      );
    }
    return (
      <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800" title="Düşük Güven - Kontrol edin">
        AI %{pct} ❓
      </span>
    );
  };

  return (
    <tr className="border-b border-gray-800/80 hover:bg-gray-800/30 transition-colors">
      <td className="py-2 px-2 text-gray-500 text-xs font-mono">{index + 1}</td>
      <td className="py-2 px-2">
        <div className="flex items-center gap-1.5">
          <input
            className="w-full rounded-lg bg-gray-900/90 border border-gray-700/80 px-2.5 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
            placeholder="Oyuncu adı"
            value={player.name}
            onChange={(e) => onChange(index, "name", e.target.value)}
            maxLength={40}
          />
          {getConfidenceBadge()}
        </div>
      </td>
      <td className="py-2 px-2">
        <select
          className="rounded-lg bg-gray-900/90 border border-gray-700/80 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-gray-500"
          value={player.position}
          onChange={(e) => onChange(index, "position", e.target.value as Position)}
        >
          {POSITIONS.map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 px-2">
        <span className="inline-flex w-16 justify-center rounded-lg border border-gray-800 bg-gray-900/60 px-2 py-1.5 text-sm font-bold text-gray-300 tabular-nums">
          {player.overall}
        </span>
      </td>
      <td className="py-2 px-2 hidden sm:table-cell">
        <input
          type="number"
          min={1}
          max={99}
          placeholder="—"
          className="w-14 rounded-lg bg-gray-900/90 border border-gray-700/80 px-2 py-1.5 text-sm text-gray-300 text-center focus:outline-none focus:border-gray-500"
          value={player.attributes.pace ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Math.max(1, Math.min(99, parseInt(e.target.value)));
            onChange(index, "attr.pace", v);
          }}
        />
      </td>
      <td className="py-2 px-2 hidden sm:table-cell">
        <input
          type="number"
          min={1}
          max={99}
          placeholder="—"
          className="w-14 rounded-lg bg-gray-900/90 border border-gray-700/80 px-2 py-1.5 text-sm text-gray-300 text-center focus:outline-none focus:border-gray-500"
          value={player.attributes.shooting ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Math.max(1, Math.min(99, parseInt(e.target.value)));
            onChange(index, "attr.shooting", v);
          }}
        />
      </td>
    </tr>
  );
}

// ─── Takım Formu ──────────────────────────────────────────────────────────────

interface TeamFormProps {
  label: "home" | "away";
  roster: Roster;
  onChange: (roster: Roster) => void;
  game: GameVersion;
}

function TeamForm({ label, roster, onChange, game }: TeamFormProps) {
  const theme = GAME_THEME[game];
  const title = label === "home" ? "Ev Sahibi Takım" : "Misafir Takım";

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const handlePlayerChange = useCallback(
    (index: number, field: string, value: unknown) => {
      const players = [...roster.players];
      if (field.startsWith("attr.")) {
        const attr = field.slice(5) as keyof Player["attributes"];
        players[index] = {
          ...players[index],
          attributes: { ...players[index].attributes, [attr]: value },
        };
      } else {
        players[index] = { ...players[index], [field]: value };
      }
      onChange({ ...roster, players });
    },
    [roster, onChange]
  );

  const handleFormationChange = (formation: string) => {
    onChange({ ...roster, formation });
  };

  const handleFileSelect = (file: File) => {
    if (file.size > MAX_ROSTER_IMAGE_BYTES) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setUploadError("Gorsel en fazla 3.75 MB olabilir.");
      setUploadSuccess(null);
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
    setUploadSuccess(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setAnalyzing(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const fd = new FormData();
      fd.append("image", selectedFile);
      fd.append("game", game);

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Görsel analiz edilirken bir hata oluştu.");
      }

      // Analiz edilen oyuncuları 11 kişilik kadro yapısına entegre et
      const detectedPlayers: Player[] = (data.players || []).map((p: any, i: number) => {
        const fallbackPos = DEFAULT_POSITIONS_442[i] || "CM";
        return {
          id: genId(),
          name: p.name || `Oyuncu ${i + 1}`,
          position: p.position || fallbackPos,
          overall: p.overall || 75,
          attributes: {
            pace: p.pace ?? null,
            shooting: p.shooting ?? null,
            passing: p.passing ?? null,
            dribbling: p.dribbling ?? null,
            defending: p.defending ?? null,
            physical: p.physical ?? null,
          },
          confidence: p.confidence ?? 0.8,
          source: "image" as const,
        };
      });

      // Eğer 11'den az oyuncu tespit edildiyse kalanları default ile tamamla
      const filledPlayers: Player[] = [...detectedPlayers];
      while (filledPlayers.length < 11) {
        const idx = filledPlayers.length;
        filledPlayers.push(defaultPlayer(idx, DEFAULT_POSITIONS_442[idx] || "CM"));
      }
      // Fazla varsa ilk 11'i al
      const final11 = filledPlayers.slice(0, 11);

      onChange({
        ...roster,
        formation: data.formation && FORMATIONS.includes(data.formation) ? data.formation : roster.formation,
        players: final11,
      });

      setUploadSuccess(
        `AI Analizi Tamamlandı! ${detectedPlayers.length} oyuncu tespit edildi. İhtiyaç halinde aşağıdaki tablodan düzenleyebilirsiniz.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Analiz başarısız oldu.";
      setUploadError(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className={`rounded-2xl border ${theme.border} ${theme.bg} p-5 backdrop-blur-sm flex flex-col gap-4 shadow-xl`}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <span className={`rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-widest ${theme.badge}`}>
          {theme.label}
        </span>
      </div>

      {/* Kadro Fotoğrafı Yükleme Alanı */}
      <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/60 p-4">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {previewUrl ? (
            <div className="relative group w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden border border-gray-600 bg-black shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Kadro Görseli" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                }}
                className="absolute inset-0 bg-black/70 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-semibold transition-opacity"
              >
                Değiştir ✕
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto flex-1 cursor-pointer flex flex-col items-center justify-center p-4 rounded-lg hover:bg-gray-800/60 transition-colors text-center"
            >
              <div className="text-3xl mb-1">📸</div>
              <p className="text-sm font-semibold text-gray-300">Kadro Ekran Görüntüsü Yükle</p>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />

          {selectedFile && (
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing}
                className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-all shadow-md flex items-center justify-center gap-2 ${
                  analyzing
                    ? "bg-gray-700 cursor-not-allowed opacity-75"
                    : `${theme.button} hover:scale-[1.02]`
                }`}
              >
                {analyzing ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    AI Analiz Ediyor...
                  </>
                ) : (
                  <>⚡ Kadroyu Fotoğraftan Oku (AI)</>
                )}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-gray-400 hover:text-white underline text-center"
              >
                Farklı fotoğraf seç
              </button>
            </div>
          )}
        </div>

        {uploadError && (
          <div className="mt-3 p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
            <span className="font-bold">Hata: </span> {uploadError}
          </div>
        )}

        {uploadSuccess && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs">
            <span className="font-bold">✓ </span> {uploadSuccess}
          </div>
        )}
      </div>

      {/* Takım adı + diziliş */}
      <div className="flex gap-3">
        <input
          className="flex-1 rounded-lg bg-gray-900/90 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
          placeholder="Takım adı"
          value={roster.teamName}
          onChange={(e) => onChange({ ...roster, teamName: e.target.value })}
          maxLength={40}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Diziliş:</span>
          <select
            className="rounded-lg bg-gray-900/90 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
            value={roster.formation}
            onChange={(e) => handleFormationChange(e.target.value)}
          >
            {FORMATIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <SavedTeamsPanel game={game} roster={roster} onLoad={onChange} />

      {/* Oyuncu tablosu */}
      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950/70">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-400 uppercase tracking-wide bg-gray-900/40">
              <th className="py-2.5 px-2 w-8">#</th>
              <th className="py-2.5 px-2">Oyuncu</th>
              <th className="py-2.5 px-2">Pozisyon</th>
              <th className="py-2.5 px-2">OVR</th>
              <th className="py-2.5 px-2 hidden sm:table-cell">Hız</th>
              <th className="py-2.5 px-2 hidden sm:table-cell">Şut</th>
            </tr>
          </thead>
          <tbody>
            {roster.players.map((player, i) => (
              <PlayerRow
                key={player.id}
                player={player}
                index={i}
                onChange={handlePlayerChange}
                game={game}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Ana kadro giriş sayfası ──────────────────────────────────────────────────

interface RosterPageClientProps {
  game: GameVersion;
}

export default function RosterPageClient({ game }: RosterPageClientProps) {
  const router = useRouter();
  const theme = GAME_THEME[game];

  const [homeRoster, setHomeRoster] = useState<Roster>(() => ({
    ...emptyRoster(game),
    teamName: "Ev Sahibi",
  }));
  const [awayRoster, setAwayRoster] = useState<Roster>(() => ({
    ...emptyRoster(game),
    teamName: "Misafir",
  }));
  const [errors, setErrors] = useState<string[]>([]);

  const handleStart = () => {
    const homeErrors = validateRoster(homeRoster);
    const awayErrors = validateRoster(awayRoster);
    const allErrors = [
      ...homeErrors.map((e) => `Ev sahibi: ${e.message}`),
      ...awayErrors.map((e) => `Misafir: ${e.message}`),
    ];

    if (allErrors.length > 0) {
      setErrors(allErrors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setErrors([]);

    // İstatistikleri doldur ve sessionStorage'a kaydet
    const filledHome: Roster = {
      ...homeRoster,
      players: homeRoster.players.map(fillMissingAttributes),
    };
    const filledAway: Roster = {
      ...awayRoster,
      players: awayRoster.players.map(fillMissingAttributes),
    };

    sessionStorage.setItem("homeRoster", JSON.stringify(filledHome));
    sessionStorage.setItem("awayRoster", JSON.stringify(filledAway));

    router.push(`/${game}/match`);
  };

  return (
    <main className="fifa-interface min-h-screen max-w-7xl mx-auto px-4 py-8">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="flex items-center gap-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors"
          >
            ← Ana Sayfa
          </a>
          <h1 className="text-3xl font-black">
            <span className={`text-${theme.accent}-400`}>{theme.label}</span> Kadro Kurulumu
          </h1>
        </div>
      </div>

      {/* Hata listesi */}
      {errors.length > 0 && (
        <div className="mb-6 rounded-xl bg-red-950 border border-red-700 p-4">
          <p className="font-bold text-red-400 mb-2">Lütfen şu hataları düzeltin:</p>
          <ul className="list-disc list-inside space-y-1">
            {errors.map((e, i) => (
              <li key={i} className="text-sm text-red-300">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* İki takım yan yana */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <TeamForm
          label="home"
          roster={homeRoster}
          onChange={setHomeRoster}
          game={game}
        />
        <TeamForm
          label="away"
          roster={awayRoster}
          onChange={setAwayRoster}
          game={game}
        />
      </div>

      {/* Maç başlat butonu */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleStart}
          className={`${theme.button} rounded-2xl px-12 py-4 text-lg font-bold text-white transition-all hover:scale-105 shadow-xl hover:shadow-2xl`}
        >
          ⚽ Kadroları Onayla ve Maçı Başlat
        </button>
      </div>
    </main>
  );
}

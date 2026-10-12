"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { GameVersion, Player, Position, Roster } from "@/lib/types";
import { MAX_ROSTER_IMAGE_BYTES } from "@/lib/image-upload";
import type { Room } from "@/lib/rooms-store";
import { validateRoster } from "@/lib/roster-validator";
import SavedTeamsPanel from "@/app/[game]/_components/SavedTeamsPanel";
import { getRankedProfile } from "@/lib/ranked-profile";
import { getRoomAccessToken } from "@/lib/room-access";

let _idCounter = 0;
function genId() {
  return `p-${++_idCounter}`;
}

const POSITIONS: Position[] = [
  "GK", "CB", "LB", "RB", "LWB", "RWB",
  "CDM", "CM", "CAM", "LM", "RM",
  "LW", "RW", "CF", "ST",
];

const FORMATIONS = [
  "4-4-2", "4-3-3", "4-2-3-1", "4-5-1",
  "3-5-2", "3-4-3", "5-3-2", "5-4-1",
  "4-1-2-1-2", "4-3-2-1",
];

const DEFAULT_POSITIONS_442: Position[] = [
  "GK", "RB", "CB", "CB", "LB",
  "RM", "CM", "CM", "LM", "ST", "ST",
];

function defaultPlayer(i: number, position: Position): Player {
  return {
    id: genId(),
    name: "",
    position,
    overall: 75,
    attributes: { pace: null, shooting: null, passing: null, dribbling: null, defending: null, physical: null },
    confidence: 1,
    source: "manual",
  };
}

function emptyRoster(gameVersion: GameVersion, teamName: string): Roster {
  return {
    teamName,
    formation: "4-4-2",
    players: DEFAULT_POSITIONS_442.map((pos, i) => defaultPlayer(i, pos)),
    gameVersion,
  };
}

const GAME_THEME = {
  fifa14: {
    accent: "blue",
    border: "border-blue-700",
    bg: "bg-blue-950/60",
    button: "bg-blue-600 hover:bg-blue-500",
    label: "FIFA 14",
    badge: "bg-blue-700 text-blue-200",
  },
  fifa15: {
    accent: "green",
    border: "border-green-700",
    bg: "bg-green-950/60",
    button: "bg-green-600 hover:bg-green-500",
    label: "FIFA 15",
    badge: "bg-green-700 text-green-200",
  },
};

export default function RoomLobbyClient({
  game,
  roomId,
}: {
  game: GameVersion;
  roomId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = (searchParams.get("role") as "host" | "guest") || "host";
  const theme = GAME_THEME[game];

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Kendi kadro durumu
  const [roster, setRoster] = useState<Roster>(() =>
    emptyRoster(game, role === "host" ? "Ev Sahibi" : "Misafir")
  );
  const [isReady, setIsReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Fotoğraf analizi
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Odayı çek (Polling: her 1.5 saniyede bir)
  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}`);
      if (res.ok) {
        const data = await res.json();
        const r: Room = data.room;
        setRoom(r);

        // İki taraf da hazır ve maç başladıysa canlı metin maç ekranına git
        if (r.status === "playing" || r.status === "ready" || r.status === "finished") {
          router.push(`/${game}/match/${roomId}?role=${role}`);
        }
      }
    } catch (e) {
      console.error("Oda sorgulama hatası:", e);
    } finally {
      setLoading(false);
    }
  }, [roomId, game, role, router]);

  useEffect(() => {
    // Misafir olarak bağlandıysa sunucuya join bildir
    if (role === "guest") {
      const guestAccessToken = getRoomAccessToken(roomId, "guest");
      fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestName: "Misafir", guestAccessToken }),
      }).catch(() => {});
    }

    fetchRoom();
    const interval = setInterval(fetchRoom, 1500);
    return () => clearInterval(interval);
  }, [fetchRoom, roomId, role]);

  // Oyuncu değişiklik işleyicisi
  const handlePlayerChange = (index: number, field: string, value: unknown) => {
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
    setRoster({ ...roster, players });
  };

  // Fotoğraf yükleme ve AI analiz
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
    setPreviewUrl(URL.createObjectURL(file));
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

      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Görsel analiz edilemedi.");
      }

      const detectedPlayers: Player[] = (data.players || []).map((p: any, i: number) => ({
        id: genId(),
        name: p.name || `Oyuncu ${i + 1}`,
        position: p.position || DEFAULT_POSITIONS_442[i] || "CM",
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
      }));

      const filled = [...detectedPlayers];
      while (filled.length < 11) {
        const idx = filled.length;
        filled.push(defaultPlayer(idx, DEFAULT_POSITIONS_442[idx] || "CM"));
      }
      const final11 = filled.slice(0, 11);

      setRoster({
        ...roster,
        formation: data.formation && FORMATIONS.includes(data.formation) ? data.formation : roster.formation,
        players: final11,
      });

      setUploadSuccess(`AI Analizi Tamamlandı! ${detectedPlayers.length} oyuncu tespit edildi.`);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Analiz başarısız.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Kadroyu Onayla ve Hazırım de
  const handleReady = async () => {
    const valErrors = validateRoster(roster);
    if (valErrors.length > 0) {
      setErrors(valErrors.map((e) => e.message));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setErrors([]);
    setSubmitting(true);
    const rankedProfile = room?.ranked ? getRankedProfile() : null;

    try {
      const res = await fetch(`/api/rooms/${roomId}/ready`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          roster,
          profileId: rankedProfile?.id,
          profileName: rankedProfile?.name,
          roomToken: getRoomAccessToken(roomId, role),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Hazır durumu iletilemedi.");
      }

      setIsReady(true);

      // İki taraf da hazır olduysa hemen maça yönlendir
      if (data.room?.status === "playing" || data.room?.status === "ready") {
        router.push(`/${game}/match/${roomId}?role=${role}`);
      } else {
        fetchRoom();
      }
    } catch (err: unknown) {
      setErrors([err instanceof Error ? err.message : "Hata oluştu."]);
    } finally {
      setSubmitting(false);
    }
  };

  // Bot rakip ekle (Tek başına hemen denemek için)
  const handleAddBot = async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/bot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomToken: getRoomAccessToken(roomId, "host") }),
      });
      if (res.ok) {
        fetchRoom();
      }
    } catch (e) {
      console.error("Bot eklenemedi:", e);
    }
  };

  const copyShareLink = () => {
    const link = `${window.location.origin}/${game}/room/${roomId}?role=guest`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading && !room) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        <div className="animate-pulse">Odaya bağlanılıyor...</div>
      </div>
    );
  }

  const opponent = role === "host" ? room?.guest : room?.host;
  const opponentRole = role === "host" ? "Misafir" : "Ev Sahibi";

  return (
    <main className="fifa-interface min-h-screen max-w-6xl mx-auto px-4 py-8">
      {/* Üst Bar: Oda Bilgisi & Paylaşım */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gray-900 border border-gray-800 mb-6 shadow-xl">
        <div>
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest ${theme.badge}`}>
              {theme.label}
            </span>
            {room?.ranked && <span className="rounded-full border border-amber-800/70 bg-amber-950/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">Ranked</span>}
            <h1 className="text-2xl font-black text-white">
              Oda Kodu: <span className="font-mono text-yellow-400 tracking-wider">{roomId}</span>
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Senin Rolün: <span className="text-white font-bold">{role === "host" ? "Ev Sahibi (Oda Kurucusu)" : "Misafir (Rakip)"}</span>
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={copyShareLink}
            className="flex-1 sm:flex-none rounded-xl bg-gray-800 hover:bg-gray-700 px-4 py-2.5 text-xs font-bold text-white transition-all flex items-center justify-center gap-2 border border-gray-700"
          >
            {copied ? "✓ Bağlantı Kopyalandı!" : "🔗 Rakip Davet Bağlantısını Kopyala"}
          </button>
        </div>
      </div>

      {/* Durum Kartları: İki Tarafın Eşleşme Durumu */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Senin Durumun */}
        <div className={`p-4 rounded-xl border ${isReady ? "border-emerald-700 bg-emerald-950/30" : "border-gray-800 bg-gray-900/60"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400">SENİN KADRON</span>
            {isReady ? (
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">✓ ONAYLANDI (HAZIR)</span>
            ) : (
              <span className="text-xs text-amber-400">Kadro hazırlanıyor...</span>
            )}
          </div>
          <p className="text-lg font-bold text-white truncate">{roster.teamName || "Takımın"}</p>
          <p className="text-xs text-gray-500">Diziliş: {roster.formation}</p>
        </div>

        {/* Rakip Durumu */}
        <div className={`p-4 rounded-xl border ${opponent?.ready ? "border-emerald-700 bg-emerald-950/30" : "border-gray-800 bg-gray-900/60"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400">RAKİP ({opponentRole.toUpperCase()})</span>
            {opponent?.ready ? (
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">✓ ONAYLANDI (HAZIR)</span>
            ) : opponent ? (
              <span className="text-xs text-amber-400 animate-pulse">Kadrosunu yüklüyor...</span>
            ) : (
              <span className="text-xs text-gray-500">Katılım bekleniyor...</span>
            )}
          </div>

          {opponent ? (
            <div>
              <p className="text-lg font-bold text-white truncate">{opponent.name || "Rakip Takım"}</p>
              <p className="text-xs text-gray-500">
                {opponent.ready ? `Diziliş: ${opponent.roster?.formation || "4-4-2"}` : "Henüz onaylamadı"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-1">
              {!room?.ranked && (
                <button
                  onClick={handleAddBot}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white transition-all shadow"
                >
                  ⚡ Hızlı Bot Rakip Ekle
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bekleme Uyarısı */}
      {isReady && !opponent?.ready && (
        <div className="mb-6 p-4 rounded-xl bg-indigo-950/60 border border-indigo-700 text-indigo-200 text-sm flex items-center gap-3">
          <div className="animate-spin text-xl">⏳</div>
          <div>
            <p className="font-bold">Kadronuz onaylandı! Rakip bekleniyor...</p>
            <p className="text-xs text-indigo-300">
              Rakip de kadrosunu yükleyip onayladığında maç arka planda oynanacak ve canlı metin yayını başlayacak.
            </p>
          </div>
        </div>
      )}

      {/* İki taraf da hazırsa büyük Canlı Maça Git butonu */}
      {isReady && opponent?.ready && (
        <div className="mb-6 p-5 rounded-2xl bg-emerald-950/80 border border-emerald-600 text-emerald-200 text-sm flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl animate-pulse">
          <div className="flex items-center gap-3">
            <div className="text-3xl">⚽</div>
            <div>
              <p className="font-bold text-base text-white">İki kadro da hazır! Maç başlıyor...</p>
              <p className="text-xs text-emerald-300">
                Canlı spiker yayınına aktarılıyorsunuz. Hemen geçmek için butona tıklayabilirsiniz:
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              if (role === "guest" && (!room?.guest || !room.guest.ready)) {
                await fetch(`/api/rooms/${roomId}/ready`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    role,
                    roster,
                    profileId: room?.ranked ? getRankedProfile().id : undefined,
                    profileName: room?.ranked ? getRankedProfile().name : undefined,
                    roomToken: getRoomAccessToken(roomId, role),
                  }),
                }).catch(() => {});
              }
              router.push(`/${game}/match/${roomId}?role=${role}`);
            }}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-6 py-3 text-sm font-bold text-white transition-all shadow-lg hover:scale-105 whitespace-nowrap"
          >
            🎙️ Canlı Maçı Başlat / İzle →
          </button>
        </div>
      )}

      {/* Hatalar */}
      {errors.length > 0 && (
        <div className="mb-6 rounded-xl bg-red-950 border border-red-700 p-4">
          <p className="font-bold text-red-400 mb-1 text-sm">Lütfen hataları düzeltin:</p>
          <ul className="list-disc list-inside space-y-1 text-xs text-red-300">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Kadro Yükleme & Düzenleme Formu */}
      {!isReady && (
        <div className={`rounded-2xl border ${theme.border} ${theme.bg} p-6 shadow-xl`}>
          <h2 className="text-xl font-bold text-white mb-4">1. Kadro Fotoğrafını Yükle veya Düzenle</h2>

          {/* Fotoğraf Yükleme Kutusu */}
          <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/60 p-4 mb-6">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {previewUrl ? (
                <div className="relative group w-24 h-24 rounded-lg overflow-hidden border border-gray-600 bg-black shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Kadro Görseli" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                    }}
                    className="absolute inset-0 bg-black/70 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-semibold"
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
                      analyzing ? "bg-gray-700 opacity-75" : `${theme.button} hover:scale-[1.02]`
                    }`}
                  >
                    {analyzing ? "AI Kadroyu İnceliyor..." : "⚡ Fotoğraftan Kadroyu Tara (AI)"}
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
                {uploadError}
              </div>
            )}
            {uploadSuccess && (
              <div className="mt-3 p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs">
                {uploadSuccess}
              </div>
            )}
          </div>

          {/* Takım Adı & Diziliş */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              className="flex-1 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
              placeholder="Takım Adın"
              value={roster.teamName}
              onChange={(e) => setRoster({ ...roster, teamName: e.target.value })}
              maxLength={40}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Diziliş:</span>
              <select
                className="rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none"
                value={roster.formation}
                onChange={(e) => setRoster({ ...roster, formation: e.target.value })}
              >
                {FORMATIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-5">
            <SavedTeamsPanel game={game} roster={roster} onLoad={setRoster} />
          </div>

          {/* Oyuncular Tablosu */}
          <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950/70 mb-6">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-400 uppercase tracking-wide bg-gray-900/40">
                  <th className="py-2.5 px-2 w-8">#</th>
                  <th className="py-2.5 px-2">Oyuncu Adı</th>
                  <th className="py-2.5 px-2">Mevki</th>
                  <th className="py-2.5 px-2">OVR</th>
                  <th className="py-2.5 px-2 hidden sm:table-cell">Hız</th>
                  <th className="py-2.5 px-2 hidden sm:table-cell">Şut</th>
                </tr>
              </thead>
              <tbody>
                {roster.players.map((player, i) => (
                  <tr key={player.id} className="border-b border-gray-800/80 hover:bg-gray-800/30">
                    <td className="py-2 px-2 text-gray-500 text-xs font-mono">{i + 1}</td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          className="w-full rounded-lg bg-gray-900 border border-gray-700/80 px-2.5 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none"
                          placeholder="Oyuncu adı"
                          value={player.name}
                          onChange={(e) => handlePlayerChange(i, "name", e.target.value)}
                        />
                        {player.source === "image" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                            AI %{Math.round(player.confidence * 100)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <select
                        className="rounded-lg bg-gray-900 border border-gray-700/80 px-2 py-1.5 text-sm text-white focus:outline-none"
                        value={player.position}
                        onChange={(e) => handlePlayerChange(i, "position", e.target.value as Position)}
                      >
                        {POSITIONS.map((pos) => (
                          <option key={pos} value={pos}>
                            {pos}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        className="w-16 rounded-lg bg-gray-900 border border-gray-700/80 px-2 py-1.5 text-sm text-white text-center font-bold focus:outline-none"
                        value={player.overall}
                        onChange={(e) =>
                          handlePlayerChange(i, "overall", Math.max(1, Math.min(99, parseInt(e.target.value) || 75)))
                        }
                      />
                    </td>
                    <td className="py-2 px-2 hidden sm:table-cell">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        placeholder="—"
                        className="w-14 rounded-lg bg-gray-900 border border-gray-700/80 px-2 py-1.5 text-sm text-gray-300 text-center"
                        value={player.attributes.pace ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : parseInt(e.target.value);
                          handlePlayerChange(i, "attr.pace", v);
                        }}
                      />
                    </td>
                    <td className="py-2 px-2 hidden sm:table-cell">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        placeholder="—"
                        className="w-14 rounded-lg bg-gray-900 border border-gray-700/80 px-2 py-1.5 text-sm text-gray-300 text-center"
                        value={player.attributes.shooting ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : parseInt(e.target.value);
                          handlePlayerChange(i, "attr.shooting", v);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Onay Butonu */}
          <div className="flex justify-center">
            <button
              onClick={handleReady}
              disabled={submitting}
              className={`${theme.button} rounded-2xl px-12 py-4 text-lg font-bold text-white transition-all hover:scale-105 shadow-xl`}
            >
              {submitting ? "Onaylanıyor..." : "✓ Kadromu Onayla ve Hazırım"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

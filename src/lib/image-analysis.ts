// ─────────────────────────────────────────────────────────────────────────────
// Görsel analiz — Gemini Vision ile FIFA kart ekran görüntüsünden oyuncu çıkarma
// Sunucu tarafında çalışır; API anahtarı istemciye sızmaz.
// ─────────────────────────────────────────────────────────────────────────────

import type { Player, Position, GameVersion } from "./types";

export interface AnalyzedPlayer {
  name: string | null;
  position: Position | null;
  overall: number | null;
  pace: number | null;
  shooting: number | null;
  passing: number | null;
  dribbling: number | null;
  defending: number | null;
  physical: number | null;
  confidence: number;
}

export interface AnalysisResult {
  formation: string | null;
  players: AnalyzedPlayer[];
  rawResponse: string;
  error?: string;
}

// Geçerli pozisyonlar (Gemini çıktısını validate etmek için)
const VALID_POSITIONS: Position[] = [
  "GK", "CB", "LB", "RB", "LWB", "RWB",
  "CDM", "CM", "CAM", "LM", "RM",
  "LW", "RW", "CF", "ST",
];

// Pozisyon normalize — Gemini bazen farklı yazabilir
function normalizePosition(raw: string | null | undefined): Position | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  // Alias'lar
  const aliases: Record<string, Position> = {
    GK: "GK", GKP: "GK",
    CB: "CB", DC: "CB", SW: "CB",
    LB: "LB", LWB: "LWB",
    RB: "RB", RWB: "RWB",
    CDM: "CDM", DM: "CDM", DMF: "CDM",
    CM: "CM", CMF: "CM", MF: "CM",
    CAM: "CAM", AMF: "CAM", SS: "CAM",
    LM: "LM", LMF: "LM",
    RM: "RM", RMF: "RM",
    LW: "LW", LWF: "LW",
    RW: "RW", RWF: "RW",
    CF: "CF", AMF2: "CF",
    ST: "ST", FW: "ST", CF2: "ST", S: "ST",
  };
  return aliases[upper] ?? (VALID_POSITIONS.includes(upper as Position) ? upper as Position : null);
}

function safeInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  if (isNaN(n) || n < 1 || n > 99) return null;
  return n;
}

// Gemini'nin döndürdüğü JSON'ı parse et
export function parseGeminiResponse(raw: string): AnalysisResult {
  // Bazen Gemini ```json ... ``` bloğu içinde döner
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch?.[1] ?? jsonMatch?.[0] ?? raw;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr.trim());
  } catch {
    return {
      formation: null,
      players: [],
      rawResponse: raw,
      error: "Gemini yanıtı JSON olarak parse edilemedi.",
    };
  }

  const rawPlayers = Array.isArray(parsed.players) ? parsed.players : [];
  const players: AnalyzedPlayer[] = rawPlayers.map((p: Record<string, unknown>) => {
    const attrs = (p.attributes as Record<string, unknown>) ?? {};
    return {
      name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : null,
      position: normalizePosition(p.position as string),
      overall: safeInt(p.overall),
      pace: safeInt(attrs.pace ?? p.pace),
      shooting: safeInt(attrs.shooting ?? p.shooting),
      passing: safeInt(attrs.passing ?? p.passing),
      dribbling: safeInt(attrs.dribbling ?? p.dribbling),
      defending: safeInt(attrs.defending ?? p.defending),
      physical: safeInt(attrs.physical ?? p.physical),
      confidence: typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : 0.7,
    };
  });

  return {
    formation: typeof parsed.formation === "string" ? parsed.formation : null,
    players,
    rawResponse: raw,
  };
}

// Gemini'ye gönderilecek sistem prompt'u
export function buildAnalysisPrompt(gameVersion: GameVersion): string {
  return `Sen bir FIFA ${gameVersion === "fifa14" ? "14" : "15"} Ultimate Team uzmanısın.
Kullanıcı bir FIFA Ultimate Team kadro ekran görüntüsü yükledi.
Görevin: Görseldeki oyuncu kartlarını analiz edip aşağıdaki JSON formatında yanıt vermek.

KURALLAR:
- Yalnızca görselde gördüklerini yaz. Görmediğin bilgileri UYDURMA.
- Okunamayan alanları null bırak.
- Her tespite confidence (0.0-1.0) ver.
- Kaleci GK pozisyonunda olmalı.
- Dizilişi (formation) tahmin et: 4-4-2, 4-3-3 gibi.
- Oyuncu pozisyonları için sadece şu değerleri kullan: GK, CB, LB, RB, LWB, RWB, CDM, CM, CAM, LM, RM, LW, RW, CF, ST
- Genel reyting (OVR) kartın ortasındaki büyük sayıdır.
- Hız (PAC/SPD), Şut (SHO), Pas (PAS/DRI... arayüze göre), Dripling (DRI), Savunma (DEF), Fizik (PHY) değerleri kartta varsa oku.

YANIT FORMATI (sadece bu JSON, başka metin yazma):
{
  "formation": "4-3-3",
  "players": [
    {
      "name": "Oyuncu Adı",
      "position": "ST",
      "overall": 87,
      "attributes": {
        "pace": 91,
        "shooting": 88,
        "passing": 72,
        "dribbling": 85,
        "defending": 30,
        "physical": 78
      },
      "confidence": 0.92
    }
  ]
}`;
}

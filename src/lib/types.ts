// ─────────────────────────────────────────────────────────────────────────────
// FIFA Simülasyon — Temel Tipler
// ─────────────────────────────────────────────────────────────────────────────

/** Desteklenen oyun versiyonları */
export type GameVersion = "fifa14" | "fifa15";

/** Oyuncu pozisyonları */
export type Position =
  | "GK"
  | "CB"
  | "LB"
  | "RB"
  | "LWB"
  | "RWB"
  | "CDM"
  | "CM"
  | "CAM"
  | "LM"
  | "RM"
  | "LW"
  | "RW"
  | "CF"
  | "ST";

/** Oyuncu istatistikleri */
export interface PlayerAttributes {
  pace: number | null;
  shooting: number | null;
  passing: number | null;
  dribbling: number | null;
  defending: number | null;
  physical: number | null;
}

/** Tek oyuncu kaydı */
export interface Player {
  id: string;
  name: string;
  position: Position;
  overall: number;
  attributes: PlayerAttributes;
  confidence: number;
  source: "manual" | "image";
  cardPosition?: Position;
}

/** Takım kadrosu */
export interface Roster {
  teamName: string;
  formation: string;
  players: Player[]; // 11 oyuncu
  gameVersion: GameVersion;
}

// ─────────────────────────────────────────────────────────────────────────────
// Maç Motoru & Uzatmalar / Penaltılar Tipleri
// ─────────────────────────────────────────────────────────────────────────────

export type MatchEventType =
  | "kickoff"
  | "possession"
  | "attack"
  | "shot"
  | "save"
  | "goal"
  | "miss"
  | "foul"
  | "yellow_card"
  | "red_card"
  | "corner"
  | "half_time"
  | "full_time"
  | "penalty"
  | "offside"
  | "extra_time_start"
  | "extra_time_half"
  | "extra_time_end"
  | "golden_goal"
  | "penalty_shootout_start"
  | "penalty_shootout_kick"
  | "penalty_shootout_end";

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  team: "home" | "away";
  playerName?: string;
  secondaryPlayerName?: string;
  detail?: string;
}

export interface TeamStats {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  possession: number; // 0–100
  xG: number;
  saves: number;
  passAccuracy: number | null;
}

export interface MatchStatistics {
  home: TeamStats;
  away: TeamStats;
}

export interface PenaltyKick {
  team: "home" | "away";
  playerName: string;
  scored: boolean;
  scoreText: string;
}

export interface PenaltyShootoutResult {
  homeScore: number;
  awayScore: number;
  winner: "home" | "away";
  kicks: PenaltyKick[];
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  isDraw: boolean;
  regularHomeScore: number;
  regularAwayScore: number;
  events: MatchEvent[];
  statistics: MatchStatistics;
  seed: number;
  durationMs: number;
  extraTimeMode?: "golden_goal" | "classic" | null;
  penaltyShootout?: PenaltyShootoutResult | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Simülasyon Parametreleri — Gerçekçi Futbol Gol ve Olay Dengeleri
// Ortalama 2.6 - 3.0 gol hedefli, dengeli maç sonuçları
// ─────────────────────────────────────────────────────────────────────────────

export interface SimConfig {
  avgGoalsPerMatch: number;
  shotChancePerAttack: number;
  shotOnTargetRate: number;
  goalConversionRate: number;
  attackChancePerMinute: number;
  ratingInfluence: number;
  scorePressureBoost: number;
  foulChancePerMinute: number;
  yellowCardPerFoul: number;
  redCardPerYellow: number;
  cornerChancePerMinute: number;
  outOfPositionPenalty: number;
  gkInfluence: number;
  fatigueStartMinute: number;
  fatigueRate: number;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  avgGoalsPerMatch: 2.7,
  shotChancePerAttack: 0.62,
  shotOnTargetRate: 0.50,
  goalConversionRate: 0.40,
  attackChancePerMinute: 0.22,
  ratingInfluence: 0.45,
  scorePressureBoost: 0.15,
  foulChancePerMinute: 0.08,
  yellowCardPerFoul: 0.20,
  redCardPerYellow: 0.04,
  cornerChancePerMinute: 0.065,
  outOfPositionPenalty: 0.85,
  gkInfluence: 0.26,
  fatigueStartMinute: 65,
  fatigueRate: 0.002,
};

// FIFA 14: Klasik, biraz daha kontrollü futbol
export const FIFA14_SIM_CONFIG: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  avgGoalsPerMatch: 2.5,
  attackChancePerMinute: 0.20,
  shotChancePerAttack: 0.58,
  goalConversionRate: 0.38,
};

// FIFA 15: Tempolu ve hücum odaklı oyun
export const FIFA15_SIM_CONFIG: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  avgGoalsPerMatch: 2.8,
  attackChancePerMinute: 0.23,
  shotChancePerAttack: 0.64,
  goalConversionRate: 0.42,
};

export type GameVersion = "fifa14" | "fifa15";

export function getSimConfig(version: GameVersion): SimConfig {
  return version === "fifa14" ? FIFA14_SIM_CONFIG : FIFA15_SIM_CONFIG;
}

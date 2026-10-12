// ─────────────────────────────────────────────────────────────────────────────
// Kadro doğrulama yardımcıları
// ─────────────────────────────────────────────────────────────────────────────

import type { Roster, Player, Position } from "./types";

export interface ValidationError {
  field: string;
  message: string;
}

const VALID_POSITIONS: Position[] = [
  "GK", "CB", "LB", "RB", "LWB", "RWB",
  "CDM", "CM", "CAM", "LM", "RM",
  "LW", "RW", "CF", "ST",
];

export function validateRoster(roster: Roster): ValidationError[] {
  const errors: ValidationError[] = [];

  if (roster.players.length !== 11) {
    errors.push({
      field: "players",
      message: `Kadroda 11 oyuncu olmalı; şu an ${roster.players.length} oyuncu var.`,
    });
  }

  const gkCount = roster.players.filter((p) => p.position === "GK").length;
  if (gkCount !== 1) {
    errors.push({
      field: "GK",
      message: `Kadroda tam olarak 1 kaleci olmalı; şu an ${gkCount} kaleci var.`,
    });
  }

  roster.players.forEach((p, i) => {
    if (!p.name || p.name.trim().length === 0) {
      errors.push({ field: `players[${i}].name`, message: `${i + 1}. oyuncunun adı boş olamaz.` });
    }

    if (!VALID_POSITIONS.includes(p.position)) {
      errors.push({
        field: `players[${i}].position`,
        message: `Geçersiz pozisyon: ${p.position}`,
      });
    }

    if (p.overall < 1 || p.overall > 99) {
      errors.push({
        field: `players[${i}].overall`,
        message: `Genel reyting 1–99 arasında olmalı: ${p.overall}`,
      });
    }

    if (p.attributes) {
      const attrs = ["pace", "shooting", "passing", "dribbling", "defending", "physical"] as const;
      for (const attr of attrs) {
        const val = p.attributes[attr];
        if (val !== null && (val < 1 || val > 99)) {
          errors.push({
            field: `players[${i}].attributes.${attr}`,
            message: `${attr} değeri 1–99 arasında olmalı: ${val}`,
          });
        }
      }
    }
  });

  return errors;
}

/** Eksik reyting/istatistikleri varsayılan değerlerle doldurur (güven düzeyi düşük) */
export function fillMissingAttributes(player: Player): Player {
  const overall = player.overall;
  const filled = { ...player.attributes };

  if (filled.pace === null) filled.pace = Math.round(overall * 0.9 + Math.random() * 10 - 5);
  if (filled.shooting === null) filled.shooting = player.position === "GK"
    ? 25
    : Math.round(overall * 0.85 + Math.random() * 10 - 5);
  if (filled.passing === null) filled.passing = Math.round(overall * 0.88 + Math.random() * 10 - 5);
  if (filled.dribbling === null) filled.dribbling = Math.round(overall * 0.9 + Math.random() * 10 - 5);
  if (filled.defending === null) filled.defending = player.position === "GK"
    ? 15
    : Math.round(overall * 0.82 + Math.random() * 10 - 5);
  if (filled.physical === null) filled.physical = Math.round(overall * 0.87 + Math.random() * 10 - 5);

  // Clamp 1–99
  const clamp = (v: number) => Math.max(1, Math.min(99, Math.round(v)));
  return {
    ...player,
    attributes: {
      pace: clamp(filled.pace!),
      shooting: clamp(filled.shooting!),
      passing: clamp(filled.passing!),
      dribbling: clamp(filled.dribbling!),
      defending: clamp(filled.defending!),
      physical: clamp(filled.physical!),
    },
  };
}

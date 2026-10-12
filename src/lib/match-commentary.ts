import type { MatchEvent } from "./types";

type TeamLabels = { home: string; away: string };

function teamName(event: MatchEvent, labels: TeamLabels) {
  return labels[event.team] || (event.team === "home" ? "Ev Sahibi" : "Misafir");
}

/** Short match-feed copy, designed to read like in-game simulation updates. */
export function describeEvent(event: MatchEvent, labels: TeamLabels): string {
  const team = teamName(event, labels);
  const player = event.playerName || team;
  const otherPlayer = event.secondaryPlayerName;

  switch (event.type) {
    case "kickoff": return "Maç başladı.";
    case "half_time": return "İlk yarı sona erdi.";
    case "full_time": return "Maç sona erdi.";
    case "goal": return `${player} golü attı!${otherPlayer ? ` Asist: ${otherPlayer}.` : ""}`;
    case "golden_goal": return `${player} altın golü attı! Maç sona erdi.`;
    case "attack": return `${team} atağa çıktı. ${player} ceza sahasına ilerliyor.`;
    case "shot": return `${player} kaleyi denedi.`;
    case "save": return `${player} şutu kurtardı.`;
    case "miss": return `${player} şutunda isabet bulamadı.`;
    case "foul": return `${player} faul yaptı.`;
    case "yellow_card": return `${player} sarı kart gördü.`;
    case "red_card": return `${player} kırmızı kartla oyun dışında. ${team} 10 kişi.`;
    case "corner": return `${team} korner kazandı.`;
    case "penalty": return `${team} penaltı kazandı.`;
    case "offside": return `${player} ofsayta yakalandı.`;
    case "extra_time_start": return "Uzatma devreleri başladı.";
    case "extra_time_half": return "İlk uzatma devresi sona erdi.";
    case "extra_time_end": return "Uzatmalar sona erdi. Kazananı penaltılar belirleyecek.";
    case "penalty_shootout_start": return "Penaltı atışları başladı.";
    case "penalty_shootout_kick":
      return `${player} penaltı kullandı: ${event.detail || "Sonuç kaydedildi."}`;
    case "penalty_shootout_end": return `Penaltı atışları sona erdi. ${event.detail || ""}`.trim();
    case "possession": return `${team} topa sahip.`;
    default: return `${team} oyunu sürdürüyor.`;
  }
}

export function describeMatch(events: MatchEvent[], labels: TeamLabels): string[] {
  return events.map((event) => describeEvent(event, labels));
}

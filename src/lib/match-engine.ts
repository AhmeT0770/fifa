// ─────────────────────────────────────────────────────────────────────────────
// Maç Motoru — Gerçekçi Futbol Simülasyonu, Uzatmalar ve Seri Penaltılar
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Roster,
  Player,
  Position,
  MatchEvent,
  MatchResult,
  MatchStatistics,
  TeamStats,
  PenaltyKick,
  PenaltyShootoutResult,
} from "./types";
import type { SimConfig } from "./sim-config";

// ─── Deterministik PRNG (xorshift32) ────────────────────────────────────────

function createRng(seed: number) {
  let state = seed >>> 0 || 1;
  return function rand(): number {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

// ─── Pozisyon grupları ───────────────────────────────────────────────────────

const ATTACKER_POSITIONS: Position[] = ["ST", "CF", "LW", "RW", "LM", "RM"];
const MIDFIELDER_POSITIONS: Position[] = ["CAM", "CM", "CDM", "LM", "RM"];
const DEFENDER_POSITIONS: Position[] = ["CB", "LB", "RB", "LWB", "RWB"];

function isPositionMatch(player: Player): boolean {
  if (!player.cardPosition) return true;
  const naturalGroup = getPositionGroup(player.cardPosition);
  const currentGroup = getPositionGroup(player.position);
  return naturalGroup === currentGroup;
}

function getPositionGroup(pos: Position): "gk" | "def" | "mid" | "att" {
  if (pos === "GK") return "gk";
  if (DEFENDER_POSITIONS.includes(pos)) return "def";
  if (MIDFIELDER_POSITIONS.includes(pos)) return "mid";
  return "att";
}

interface TeamStrength {
  attack: number;
  midfield: number;
  defense: number;
  gkRating: number;
  overall: number;
}

function calcTeamStrength(roster: Roster, config: SimConfig): TeamStrength {
  const players = roster.players;

  const gk = players.find((p) => p.position === "GK");
  const attackers = players.filter((p) => ATTACKER_POSITIONS.includes(p.position));
  const midfielders = players.filter((p) => MIDFIELDER_POSITIONS.includes(p.position));
  const defenders = players.filter((p) => DEFENDER_POSITIONS.includes(p.position));

  const weightedRating = (group: Player[], mainAttr: keyof typeof group[0]["attributes"]) => {
    if (group.length === 0) return 68;
    const total = group.reduce((sum, p) => {
      const base = p.overall;
      const attrBonus = p.attributes[mainAttr] ? (p.attributes[mainAttr]! - base) * 0.15 : 0;
      const oop = isPositionMatch(p) ? 1 : config.outOfPositionPenalty;
      return sum + (base + attrBonus) * oop;
    }, 0);
    return total / group.length;
  };

  const attackRating = weightedRating(attackers, "shooting");
  const midfieldRating = weightedRating(midfielders, "passing");
  const defenseRating = weightedRating(defenders, "defending");
  const gkRating = gk ? gk.overall : 75;

  const allRatings = players.map((p) => p.overall);
  const overallAvg = allRatings.reduce((a, b) => a + b, 0) / (allRatings.length || 1);

  return {
    attack: attackRating,
    midfield: midfieldRating,
    defense: defenseRating,
    gkRating,
    overall: overallAvg,
  };
}

function pickPlayer(
  players: Player[],
  filter: (p: Player) => boolean,
  rand: () => number
): Player | undefined {
  const pool = players.filter(filter);
  if (pool.length === 0) return undefined;
  return pool[Math.floor(rand() * pool.length)];
}

function pickAttacker(players: Player[], rand: () => number): Player | undefined {
  return pickPlayer(players, (p) => ATTACKER_POSITIONS.includes(p.position), rand);
}

function pickMidfielder(players: Player[], rand: () => number): Player | undefined {
  return pickPlayer(players, (p) => MIDFIELDER_POSITIONS.includes(p.position), rand);
}

function pickDefender(players: Player[], rand: () => number): Player | undefined {
  return pickPlayer(players, (p) => DEFENDER_POSITIONS.includes(p.position), rand);
}

function pickAnyOutfield(players: Player[], rand: () => number): Player | undefined {
  return pickPlayer(players, (p) => p.position !== "GK", rand);
}

function emptyStats(): TeamStats {
  return {
    goals: 0,
    shots: 0,
    shotsOnTarget: 0,
    corners: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    possession: 50,
    xG: 0,
    saves: 0,
    passAccuracy: null,
  };
}

// ─── 90 Dakikalık Normal Süre Simülasyonu ─────────────────────────────────────

export function simulateMatch(
  homeRoster: Roster,
  awayRoster: Roster,
  config: SimConfig,
  seed?: number
): MatchResult {
  const startTime = Date.now();
  const resolvedSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rand = createRng(resolvedSeed);

  const homeStrength = calcTeamStrength(homeRoster, config);
  const awayStrength = calcTeamStrength(awayRoster, config);

  const events: MatchEvent[] = [];
  const homeStats = emptyStats();
  const awayStats = emptyStats();

  let homeScore = 0;
  let awayScore = 0;
  let homePossessionMinutes = 0;
  let awayPossessionMinutes = 0;

  const homeYellows: Record<string, number> = {};
  const awayYellows: Record<string, number> = {};
  let homeRedCards = 0;
  let awayRedCards = 0;

  const addEvent = (event: MatchEvent) => events.push(event);

  addEvent({ minute: 0, type: "kickoff", team: "home" });

  for (let minute = 1; minute <= 90; minute++) {
    if (minute === 45) {
      addEvent({ minute: 45, type: "half_time", team: "home" });
    }

    const fatigueFactor =
      minute > config.fatigueStartMinute
        ? 1 - (minute - config.fatigueStartMinute) * config.fatigueRate
        : 1;

    const totalMid = homeStrength.midfield + awayStrength.midfield || 1;
    const homePossProb = homeStrength.midfield / totalMid;
    const homeBall = rand() < homePossProb;

    if (homeBall) homePossessionMinutes++;
    else awayPossessionMinutes++;

    const attackingTeam: "home" | "away" = homeBall ? "home" : "away";
    const defendingTeam: "home" | "away" = homeBall ? "away" : "home";
    const atkStrength = homeBall ? homeStrength : awayStrength;
    const defStrength = homeBall ? awayStrength : homeStrength;
    const atkRoster = homeBall ? homeRoster : awayRoster;
    const defRoster = homeBall ? awayRoster : homeRoster;
    const atkStats = homeBall ? homeStats : awayStats;
    const defStats = homeBall ? awayStats : homeStats;
    const atkRedCards = homeBall ? homeRedCards : awayRedCards;

    const redCardPenalty = Math.max(0, atkRedCards * 0.08);

    // Gerçekçi hücum ihtimali
    const ratingDiff = (atkStrength.attack - defStrength.defense) / 100;
    const attackProb =
      (config.attackChancePerMinute + ratingDiff * config.ratingInfluence - redCardPenalty) *
      fatigueFactor;

    const isTrailing =
      attackingTeam === "home" ? homeScore < awayScore : awayScore < homeScore;
    const adjustedAttackProb = isTrailing
      ? attackProb + config.scorePressureBoost * 0.06
      : attackProb;

    if (rand() < Math.max(0.12, Math.min(0.55, adjustedAttackProb))) {
      const attacker = pickAttacker(atkRoster.players, rand) ??
        pickAnyOutfield(atkRoster.players, rand);
      const assister = pickMidfielder(atkRoster.players, rand) ??
        pickAnyOutfield(atkRoster.players, rand);
      const gkDefender = defRoster.players.find((p) => p.position === "GK");
      const gk = defStrength.gkRating;

      // Hücum şuta dönüştü mü?
      if (rand() < config.shotChancePerAttack) {
        atkStats.shots++;

        const shootingAttr = attacker?.attributes?.shooting ?? attacker?.overall ?? 75;
        const shotQuality = (shootingAttr / 100) * 0.65 + rand() * 0.35;
        atkStats.xG += shotQuality * 0.32;

        const onTarget = rand() < config.shotOnTargetRate + (shootingAttr - 70) / 250;
        if (onTarget) {
          atkStats.shotsOnTarget++;

          // Gol olasılığı — gerçekçi futbol dengesi
          const attackerFinish = shootingAttr / 100;
          const gkDefense = gk / 100;
          const goalProb =
            config.goalConversionRate * (attackerFinish * 0.75 + 0.25) -
            gkDefense * config.gkInfluence * 0.4 +
            (rand() * 0.12);

          if (rand() < Math.max(0.24, Math.min(0.78, goalProb))) {
            // GOL!
            if (attackingTeam === "home") homeScore++;
            else awayScore++;
            atkStats.goals++;
            addEvent({
              minute,
              type: "goal",
              team: attackingTeam,
              playerName: attacker?.name,
              secondaryPlayerName: assister?.name !== attacker?.name ? assister?.name : undefined,
            });
          } else {
            // Kaleci kurtarışı
            defStats.saves++;
            addEvent({
              minute,
              type: "save",
              team: defendingTeam,
              playerName: gkDefender?.name || "Kaleci",
            });
          }
        } else {
          // Dışarı giden şut
          addEvent({
            minute,
            type: "miss",
            team: attackingTeam,
            playerName: attacker?.name,
          });
          if (rand() < 0.35) {
            atkStats.corners++;
            addEvent({ minute, type: "corner", team: attackingTeam });
          }
        }
      } else {
        // Tehlikeli atak ama şut çekilemedi
        addEvent({
          minute,
          type: "attack",
          team: attackingTeam,
          playerName: attacker?.name || assister?.name,
        });
      }
    }

    // Faul & Kartlar
    if (rand() < config.foulChancePerMinute) {
      const foulingTeam: "home" | "away" = rand() < 0.5 ? "home" : "away";
      const foulingRoster = foulingTeam === "home" ? homeRoster : awayRoster;
      const fouler = pickDefender(foulingRoster.players, rand) ??
        pickAnyOutfield(foulingRoster.players, rand);

      const foulingStats = foulingTeam === "home" ? homeStats : awayStats;
      foulingStats.fouls++;

      addEvent({
        minute,
        type: "foul",
        team: foulingTeam,
        playerName: fouler?.name,
      });

      if (rand() < config.yellowCardPerFoul) {
        foulingStats.yellowCards++;
        const yellowMap = foulingTeam === "home" ? homeYellows : awayYellows;
        const pName = fouler?.name ?? "Oyuncu";
        yellowMap[pName] = (yellowMap[pName] ?? 0) + 1;

        addEvent({
          minute,
          type: "yellow_card",
          team: foulingTeam,
          playerName: fouler?.name,
        });

        if ((yellowMap[pName] ?? 0) >= 2 && rand() < config.redCardPerYellow) {
          foulingStats.redCards++;
          if (foulingTeam === "home") homeRedCards++;
          else awayRedCards++;
          addEvent({
            minute,
            type: "red_card",
            team: foulingTeam,
            playerName: fouler?.name,
            detail: "İkinci sarı karttan ihraç",
          });
        }
      }
    }
  }

  addEvent({ minute: 90, type: "full_time", team: "home" });

  const totalPoss = homePossessionMinutes + awayPossessionMinutes || 1;
  homeStats.possession = Math.round((homePossessionMinutes / totalPoss) * 100);
  awayStats.possession = 100 - homeStats.possession;

  homeStats.goals = homeScore;
  awayStats.goals = awayScore;

  const isDraw = homeScore === awayScore;

  return {
    homeScore,
    awayScore,
    isDraw,
    regularHomeScore: homeScore,
    regularAwayScore: awayScore,
    events,
    statistics: { home: homeStats, away: awayStats },
    seed: resolvedSeed,
    durationMs: Date.now() - startTime,
    extraTimeMode: null,
    penaltyShootout: null,
  };
}

// ─── Uzatmalar & Altın Gol Simülasyonu ───────────────────────────────────────

export function simulateExtraTime(
  homeRoster: Roster,
  awayRoster: Roster,
  regularResult: MatchResult,
  mode: "golden_goal" | "classic",
  config: SimConfig
): MatchResult {
  const rand = createRng(regularResult.seed + 104729);
  const homeStrength = calcTeamStrength(homeRoster, config);
  const awayStrength = calcTeamStrength(awayRoster, config);

  const events: MatchEvent[] = [...regularResult.events];
  // Son düdüğü uzatma başlangıcı ile güncelle
  events.push({ minute: 90, type: "extra_time_start", team: "home" });

  let homeScore = regularResult.homeScore;
  let awayScore = regularResult.awayScore;
  let goldenGoalScored = false;

  for (let minute = 91; minute <= 120; minute++) {
    if (goldenGoalScored && mode === "golden_goal") break;

    if (minute === 105) {
      events.push({ minute: 105, type: "extra_time_half", team: "home" });
    }

    const homeBall = rand() < (homeStrength.midfield / (homeStrength.midfield + awayStrength.midfield || 1));
    const attackingTeam: "home" | "away" = homeBall ? "home" : "away";
    const atkRoster = homeBall ? homeRoster : awayRoster;
    const defRoster = homeBall ? awayRoster : homeRoster;
    const defStrength = homeBall ? awayStrength : homeStrength;

    // Uzatmalarda hücum ihtimali
    if (rand() < 0.28) {
      const attacker = pickAttacker(atkRoster.players, rand) ?? pickAnyOutfield(atkRoster.players, rand);
      const assister = pickMidfielder(atkRoster.players, rand);
      const gkDefender = defRoster.players.find((p) => p.position === "GK");
      const shootingAttr = attacker?.attributes?.shooting ?? attacker?.overall ?? 75;

      if (rand() < 0.65) {
        const onTarget = rand() < 0.52;
        if (onTarget) {
          const goalProb = config.goalConversionRate * 1.1;
          if (rand() < goalProb) {
            // GOL
            if (attackingTeam === "home") homeScore++;
            else awayScore++;

            if (mode === "golden_goal") {
              goldenGoalScored = true;
              events.push({
                minute,
                type: "golden_goal",
                team: attackingTeam,
                playerName: attacker?.name,
                secondaryPlayerName: assister?.name,
              });
              break; // Altın gol ile maç anında biter!
            } else {
              events.push({
                minute,
                type: "goal",
                team: attackingTeam,
                playerName: attacker?.name,
                secondaryPlayerName: assister?.name,
              });
            }
          } else {
            events.push({
              minute,
              type: "save",
              team: attackingTeam === "home" ? "away" : "home",
              playerName: gkDefender?.name,
            });
          }
        } else {
          events.push({ minute, type: "miss", team: attackingTeam, playerName: attacker?.name });
        }
      }
    }
  }

  events.push({ minute: 120, type: "extra_time_end", team: "home" });

  let penaltyResult: PenaltyShootoutResult | null = null;
  // Eğer 120 dakika sonunda hâlâ eşitlik varsa (veya altın gol olmadıysa) penaltılar!
  if (homeScore === awayScore) {
    penaltyResult = simulatePenaltyShootout(homeRoster, awayRoster, regularResult.seed + 99991);
    events.push({ minute: 120, type: "penalty_shootout_start", team: "home" });

    for (const kick of penaltyResult.kicks) {
      events.push({
        minute: 120,
        type: "penalty_shootout_kick",
        team: kick.team,
        playerName: kick.playerName,
        detail: kick.scored ? `GOL (${kick.scoreText})` : `KAÇTI (${kick.scoreText})`,
      });
    }

    events.push({
      minute: 120,
      type: "penalty_shootout_end",
      team: penaltyResult.winner,
      detail: `Penaltılarla Kazanan: ${penaltyResult.winner === "home" ? homeRoster.teamName : awayRoster.teamName} (${penaltyResult.homeScore} - ${penaltyResult.awayScore})`,
    });
  }

  const updatedStats = { ...regularResult.statistics };
  updatedStats.home.goals = homeScore;
  updatedStats.away.goals = awayScore;

  return {
    ...regularResult,
    homeScore,
    awayScore,
    isDraw: homeScore === awayScore && !penaltyResult,
    events,
    statistics: updatedStats,
    extraTimeMode: mode,
    penaltyShootout: penaltyResult,
  };
}

// ─── Seri Penaltı Atışları Simülasyonu ───────────────────────────────────────

export function simulatePenaltyShootout(
  homeRoster: Roster,
  awayRoster: Roster,
  seed: number
): PenaltyShootoutResult {
  const rand = createRng(seed);
  const homeKickers = homeRoster.players.filter((p) => p.position !== "GK");
  const awayKickers = awayRoster.players.filter((p) => p.position !== "GK");

  let homeScore = 0;
  let awayScore = 0;
  const kicks: PenaltyKick[] = [];

  // Standart 5 tur penaltı
  for (let round = 0; round < 5; round++) {
    const hp = homeKickers[round % homeKickers.length];
    const hAttr = hp?.attributes?.shooting ?? hp?.overall ?? 75;
    const hScoreProb = (hAttr / 100) * 0.45 + 0.40; // %70-85
    const hScored = rand() < hScoreProb;
    if (hScored) homeScore++;
    kicks.push({
      team: "home",
      playerName: hp?.name || `Penaltıcı ${round + 1}`,
      scored: hScored,
      scoreText: `${homeScore} - ${awayScore}`,
    });

    const ap = awayKickers[round % awayKickers.length];
    const aAttr = ap?.attributes?.shooting ?? ap?.overall ?? 75;
    const aScoreProb = (aAttr / 100) * 0.45 + 0.40;
    const aScored = rand() < aScoreProb;
    if (aScored) awayScore++;
    kicks.push({
      team: "away",
      playerName: ap?.name || `Penaltıcı ${round + 1}`,
      scored: aScored,
      scoreText: `${homeScore} - ${awayScore}`,
    });
  }

  // Eşitlik varsa Seri Penaltılar (Sudden Death)
  let suddenRound = 5;
  while (homeScore === awayScore && suddenRound < 15) {
    const hp = homeKickers[suddenRound % homeKickers.length];
    const ap = awayKickers[suddenRound % awayKickers.length];

    const hScored = rand() < 0.72;
    if (hScored) homeScore++;
    kicks.push({
      team: "home",
      playerName: hp?.name || `Penaltıcı ${suddenRound + 1}`,
      scored: hScored,
      scoreText: `${homeScore} - ${awayScore}`,
    });

    const aScored = rand() < 0.72;
    if (aScored) awayScore++;
    kicks.push({
      team: "away",
      playerName: ap?.name || `Penaltıcı ${suddenRound + 1}`,
      scored: aScored,
      scoreText: `${homeScore} - ${awayScore}`,
    });

    suddenRound++;
  }

  const winner: "home" | "away" = homeScore >= awayScore ? "home" : "away";

  return {
    homeScore,
    awayScore,
    winner,
    kicks,
  };
}

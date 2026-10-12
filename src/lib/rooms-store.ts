// ─────────────────────────────────────────────────────────────────────────────
// Oda Sistemi (Lobi & Eşleşme Deposu)
// Arka planda maç çalıştırma ve iki tarafın eşleşmesini yönetir.
// ─────────────────────────────────────────────────────────────────────────────

import type { GameVersion, Roster, MatchResult, Player } from "./types";
import { simulateMatch } from "./match-engine";
import { getSimConfig } from "./sim-config";
import { getSupabaseAdmin } from "./supabase-admin";
import type { Json } from "./supabase.types";

export interface Participant {
  name: string;
  profileId?: string;
  roster: Roster | null;
  ready: boolean;
}

export interface Room {
  id: string;
  gameVersion: GameVersion;
  createdAt: number;
  host: Participant;
  guest: Participant | null;
  status: "waiting_guest" | "setting_up" | "ready" | "playing" | "finished";
  rematchReady: { host: boolean; guest: boolean };
  matchResult: MatchResult | null;
  ranked: boolean;
  /** Per-match idempotency key used by the ranked ledger. */
  rankedMatchId: string;
  matchStartedAt: number;
  /** Bearer credentials are server-only and must never be included in API room payloads. */
  hostAccessToken?: string;
  guestAccessToken?: string;
}

export interface OpenRoomSummary {
  id: string;
  gameVersion: GameVersion;
  createdAt: number;
  teamName: string;
  formation: string;
  teamRating: number | null;
  rosterReady: boolean;
}

export function publicRoom(room: Room): Omit<Room, "hostAccessToken" | "guestAccessToken"> {
  const safeRoom = { ...room };
  delete safeRoom.hostAccessToken;
  delete safeRoom.guestAccessToken;
  return safeRoom;
}

export function roomTokenMatches(room: Room, token: unknown, role?: "host" | "guest") {
  if (typeof token !== "string" || token.length < 32) return false;
  return role === "host"
    ? token === room.hostAccessToken
    : role === "guest"
      ? token === room.guestAccessToken
      : token === room.hostAccessToken || token === room.guestAccessToken;
}

// In-memory oda deposu (global nesne üzerinde tutulur, hot-reload'da kaybolmaz)
declare global {
  // eslint-disable-next-line no-var
  var __fifa_rooms__: Map<string, Room> | undefined;
}

const memoryRooms: Map<string, Room> = global.__fifa_rooms__ ?? new Map<string, Room>();
global.__fifa_rooms__ = memoryRooms;

type RoomMutation = { changed: boolean; conflict?: boolean; rejected?: boolean };

function getRoomDatabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase && process.env.VERCEL) {
    throw new Error("Supabase oda deposu ayarlanmamış. Vercel ortam değişkenlerini kontrol edin.");
  }
  return supabase;
}

async function mutateRoom(id: string, mutate: (room: Room) => RoomMutation): Promise<{ room: Room | null; conflict?: boolean }> {
  const normalizedId = id.toUpperCase();
  const supabase = getRoomDatabase();

  if (!supabase) {
    const room = memoryRooms.get(normalizedId);
    if (!room) return { room: null };
    const result = mutate(room);
    return result.rejected ? { room: null } : { room, conflict: result.conflict };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("game_rooms")
      .select("room_data, revision")
      .eq("room_id", normalizedId)
      .maybeSingle();
    if (error) throw new Error(`Oda okunamadı: ${error.message}`);
    if (!data) return { room: null };

    const room = structuredClone(data.room_data) as unknown as Room;
    const result = mutate(room);
    if (result.rejected) return { room: null };
    if (!result.changed) return { room, conflict: result.conflict };

    const { data: updated, error: updateError } = await supabase
      .from("game_rooms")
      .update({
        room_data: room as unknown as Json,
        status: room.status,
        updated_at: new Date().toISOString(),
        revision: data.revision + 1,
      })
      .eq("room_id", normalizedId)
      .eq("revision", data.revision)
      .select("room_id")
      .maybeSingle();
    if (updateError) throw new Error(`Oda güncellenemedi: ${updateError.message}`);
    if (updated) return { room };
  }

  throw new Error("Oda aynı anda değiştirildi. Lütfen tekrar dene.");
}

function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function createRoom(
  gameVersion: GameVersion,
  hostName: string = "Ev Sahibi",
  options: { ranked?: boolean; profileId?: string; hostAccessToken?: string } = {}
): Promise<Room> {
  const supabase = getRoomDatabase();
  if (supabase) {
    const expiredBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("game_rooms").delete().lt("updated_at", expiredBefore);
    if (error) throw new Error(`Eski odalar temizlenemedi: ${error.message}`);
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const room: Room = {
      id: generateRoomId(),
      gameVersion,
      createdAt: Date.now(),
      host: { name: hostName, profileId: options.profileId, roster: null, ready: false },
      guest: null,
      status: "waiting_guest",
      rematchReady: { host: false, guest: false },
      matchResult: null,
      ranked: options.ranked ?? false,
      rankedMatchId: globalThis.crypto.randomUUID(),
      matchStartedAt: Date.now(),
      hostAccessToken: options.hostAccessToken,
    };

    if (!supabase) {
      if (memoryRooms.has(room.id)) continue;
      memoryRooms.set(room.id, room);
      return room;
    }

    const createdAt = new Date(room.createdAt).toISOString();
    const { error } = await supabase.from("game_rooms").insert({
      room_id: room.id,
      game_version: room.gameVersion,
      created_at: createdAt,
      updated_at: createdAt,
      status: room.status,
      room_data: room as unknown as Json,
    });
    if (!error) return room;
    if (error.code !== "23505") throw new Error(`Oda oluşturulamadı: ${error.message}`);
  }
  throw new Error("Benzersiz oda kodu oluşturulamadı.");
}

export async function getRoom(id: string): Promise<Room | null> {
  const supabase = getRoomDatabase();
  if (!supabase) return memoryRooms.get(id.toUpperCase()) ?? null;
  const { data, error } = await supabase
    .from("game_rooms")
    .select("room_data")
    .eq("room_id", id.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(`Oda okunamadı: ${error.message}`);
  return (data?.room_data as unknown as Room | undefined) ?? null;
}

export async function listOpenRooms(gameVersion?: GameVersion): Promise<OpenRoomSummary[]> {
  const activeSince = Date.now() - 30 * 60 * 1000;
  const supabase = getRoomDatabase();
  let rooms: Room[];
  if (!supabase) {
    rooms = Array.from(memoryRooms.values());
  } else {
    let query = supabase
      .from("game_rooms")
      .select("room_data")
      .eq("status", "waiting_guest")
      .gte("created_at", new Date(activeSince).toISOString())
      .order("created_at", { ascending: false })
      .limit(24);
    if (gameVersion) query = query.eq("game_version", gameVersion);
    const { data, error } = await query;
    if (error) throw new Error(`Açık odalar okunamadı: ${error.message}`);
    rooms = (data ?? []).map((row) => row.room_data as unknown as Room);
  }

  return rooms
    .filter((room) =>
      room.createdAt >= activeSince
      && !room.guest
      && (!gameVersion || room.gameVersion === gameVersion)
    )
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 24)
    .map((room) => {
      const roster = room.host.roster;
      return {
        id: room.id,
        gameVersion: room.gameVersion,
        createdAt: room.createdAt,
        teamName: roster?.teamName || room.host.name || "Yeni oda",
        formation: roster?.formation || "Kadro hazırlanıyor",
        teamRating: roster
          ? Math.round(roster.players.reduce((total, player) => total + player.overall, 0) / Math.max(roster.players.length, 1))
          : null,
        rosterReady: room.host.ready && Boolean(roster),
      };
    });
}

export async function joinRoom(
  id: string,
  token: string,
  guestName: string = "Misafir"
): Promise<{ room: Room | null; conflict?: boolean }> {
  if (token.length < 32) return { room: null };
  return mutateRoom(id, (room) => {
    if (room.guestAccessToken && room.guestAccessToken !== token) {
      return { changed: false, conflict: true };
    }
    if (room.guest) {
      if (!room.guestAccessToken) {
        room.guestAccessToken = token;
        return { changed: true };
      }
      return { changed: false };
    }
    room.guest = { name: guestName, roster: null, ready: false };
    room.guestAccessToken = token;
    room.status = "setting_up";
    return { changed: true };
  });
}

export async function setParticipantReady(
  id: string,
  role: "host" | "guest",
  roster: Roster,
  profile?: { id: string; name: string }
): Promise<Room | null> {
  const outcome = await mutateRoom(id, (room) => {
    if (role === "host") {
      room.host.roster = roster;
      if (profile) {
        room.host.profileId = profile.id;
        room.host.name = profile.name;
      }
      room.host.ready = true;
    } else {
      if (!room.guest) {
        room.guest = {
          name: profile?.name || roster.teamName || "Misafir",
          profileId: profile?.id,
          roster,
          ready: true,
        };
      } else {
        if (profile) {
          room.guest.profileId = profile.id;
          room.guest.name = profile.name;
        }
        room.guest.roster = roster;
        room.guest.ready = true;
      }
    }

    if (room.host.ready && room.guest && room.guest.ready && room.status !== "playing") {
      room.status = "ready";
      runMatch(room);
    }
    return { changed: true };
  });
  return outcome.room;
}

function runMatch(room: Room) {
  if (!room.host.roster || !room.guest?.roster) return;

  const config = getSimConfig(room.gameVersion);
  // Her maç ve rövanşta tamamen taze ve bağımsız rastgele seed kullanılır
  const freshSeed = Math.floor(Math.random() * 2 ** 31);
  const result = simulateMatch(room.host.roster, room.guest.roster, config, freshSeed);
  room.matchResult = result;
  room.rankedMatchId = globalThis.crypto.randomUUID();
  room.matchStartedAt = Date.now();
  room.status = "playing";
  room.rematchReady = { host: false, guest: false };
}

/** Katılımcı rövanşı onaylar; iki taraf da onayladığında yeni maç başlar. */
export async function rematchRoom(id: string, role: "host" | "guest"): Promise<Room | null> {
  const outcome = await mutateRoom(id, (room) => {
    if (!room.host.roster || !room.guest?.roster || !room.matchResult) {
      return { changed: false, rejected: true };
    }
    room.rematchReady ??= { host: false, guest: false };
    room.rematchReady[role] = true;
    if (room.rematchReady.host && room.rematchReady.guest) runMatch(room);
    return { changed: true };
  });
  return outcome.room;
}

export async function cancelRematchRoom(id: string, role: "host" | "guest"): Promise<Room | null> {
  const outcome = await mutateRoom(id, (room) => {
    if (!room.matchResult) return { changed: false, rejected: true };
    room.rematchReady ??= { host: false, guest: false };
    if (!room.rematchReady[role]) return { changed: false };
    room.rematchReady[role] = false;
    return { changed: true };
  });
  return outcome.room;
}

export async function applyExtraTimeMode(
  id: string,
  mode: "golden_goal" | "classic"
): Promise<Room | null> {
  const outcome = await mutateRoom(id, (room) => {
    if (!room.matchResult || !room.host.roster || !room.guest?.roster) {
      return { changed: false, rejected: true };
    }
    if (room.matchResult.extraTimeMode) return { changed: false };
    if (room.matchResult.regularHomeScore !== room.matchResult.regularAwayScore) {
      return { changed: false, rejected: true };
    }

    const { simulateExtraTime } = require("./match-engine");
    room.matchResult = simulateExtraTime(
      room.host.roster,
      room.guest.roster,
      room.matchResult,
      mode,
      getSimConfig(room.gameVersion)
    );
    return { changed: true };
  });
  return outcome.room;
}

export async function addBotOpponent(id: string): Promise<Room | null> {
  const outcome = await mutateRoom(id, (room) => {
    if (room.ranked || room.guest) return { changed: false, rejected: true };

  const isFifa14 = room.gameVersion === "fifa14";
  const botTeamName = isFifa14 ? "Real Madrid 14" : "Real Madrid 15";

  const botPlayers: Player[] = [
    { id: "b1", name: "Iker Casillas", position: "GK", overall: 86, attributes: { pace: 70, shooting: 25, passing: 68, dribbling: 70, defending: 85, physical: 78 }, confidence: 1, source: "manual" },
    { id: "b2", name: "Dani Carvajal", position: "RB", overall: 80, attributes: { pace: 82, shooting: 45, passing: 72, dribbling: 77, defending: 79, physical: 78 }, confidence: 1, source: "manual" },
    { id: "b3", name: "Sergio Ramos", position: "CB", overall: 87, attributes: { pace: 79, shooting: 63, passing: 71, dribbling: 66, defending: 86, physical: 82 }, confidence: 1, source: "manual" },
    { id: "b4", name: "Pepe", position: "CB", overall: 83, attributes: { pace: 71, shooting: 30, passing: 58, dribbling: 55, defending: 83, physical: 84 }, confidence: 1, source: "manual" },
    { id: "b5", name: "Marcelo", position: "LB", overall: 82, attributes: { pace: 82, shooting: 67, passing: 78, dribbling: 84, defending: 76, physical: 77 }, confidence: 1, source: "manual" },
    { id: "b6", name: "Luka Modric", position: "CM", overall: 87, attributes: { pace: 77, shooting: 74, passing: 87, dribbling: 89, defending: 69, physical: 68 }, confidence: 1, source: "manual" },
    { id: "b7", name: "Toni Kroos", position: "CM", overall: 85, attributes: { pace: 58, shooting: 81, passing: 89, dribbling: 79, defending: 66, physical: 70 }, confidence: 1, source: "manual" },
    { id: "b8", name: "James Rodriguez", position: "CAM", overall: 86, attributes: { pace: 80, shooting: 85, passing: 86, dribbling: 85, defending: 42, physical: 72 }, confidence: 1, source: "manual" },
    { id: "b9", name: "Gareth Bale", position: "RW", overall: 87, attributes: { pace: 94, shooting: 84, passing: 83, dribbling: 86, defending: 61, physical: 80 }, confidence: 1, source: "manual" },
    { id: "b10", name: "Karim Benzema", position: "ST", overall: 85, attributes: { pace: 82, shooting: 84, passing: 75, dribbling: 82, defending: 30, physical: 74 }, confidence: 1, source: "manual" },
    { id: "b11", name: "Cristiano Ronaldo", position: "LW", overall: 92, attributes: { pace: 93, shooting: 93, passing: 81, dribbling: 91, defending: 33, physical: 79 }, confidence: 1, source: "manual" },
  ];

  const botRoster: Roster = {
    teamName: botTeamName,
    formation: "4-3-3",
    players: botPlayers,
    gameVersion: room.gameVersion,
  };

  room.guest = {
    name: botTeamName,
    roster: botRoster,
    ready: true,
  };

  if (room.host.ready) {
    room.status = "ready";
    runMatch(room);
  } else {
    room.status = "setting_up";
  }

    return { changed: true };
  });
  return outcome.room;
}

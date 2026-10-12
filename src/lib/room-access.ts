export type RoomRole = "host" | "guest";

const keyFor = (roomId: string, role: RoomRole) => `fifa-room-access-v1-${roomId}-${role}`;

export function createRoomAccessToken() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function saveRoomAccessToken(roomId: string, role: RoomRole, token: string) {
  sessionStorage.setItem(keyFor(roomId, role), token);
}

export function getRoomAccessToken(roomId: string, role: RoomRole) {
  const key = keyFor(roomId, role);
  let token = sessionStorage.getItem(key);
  if (!token) {
    token = createRoomAccessToken();
    sessionStorage.setItem(key, token);
  }
  return token;
}

export function getAnyRoomAccessToken(roomId: string) {
  return sessionStorage.getItem(keyFor(roomId, "host"))
    || sessionStorage.getItem(keyFor(roomId, "guest"))
    || "";
}

export function getStoredRoomRole(roomId: string): RoomRole | null {
  if (sessionStorage.getItem(keyFor(roomId, "host"))) return "host";
  if (sessionStorage.getItem(keyFor(roomId, "guest"))) return "guest";
  return null;
}

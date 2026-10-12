export interface RankedProfile {
  id: string;
  name: string;
}

const PROFILE_KEY = "fifa-ranked-profile-v1";

export function getRankedProfile(): RankedProfile {
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    if (saved) {
      const profile = JSON.parse(saved) as Partial<RankedProfile>;
      if (
        typeof profile.id === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profile.id)
        && typeof profile.name === "string"
      ) {
        return { id: profile.id, name: profile.name };
      }
    }
  } catch {
    // Use a fresh anonymous profile when local storage is unavailable or invalid.
  }

  const randomHex = () => Math.floor(Math.random() * 16).toString(16);
  const id = globalThis.crypto?.randomUUID?.() ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Number.parseInt(randomHex(), 16);
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
  const profile = { id, name: "Teknik Direktör" };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // The current tab can still play if local storage is disabled.
  }
  return profile;
}

export function saveRankedProfile(profile: RankedProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

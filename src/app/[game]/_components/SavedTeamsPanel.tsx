"use client";

import { useEffect, useState } from "react";
import type { GameVersion, Roster } from "@/lib/types";

interface SavedTeam {
  id: string;
  roster: Roster;
}

export default function SavedTeamsPanel({
  game,
  roster,
  onLoad,
}: {
  game: GameVersion;
  roster: Roster;
  onLoad: (roster: Roster) => void;
}) {
  const storageKey = `fifa-saved-teams-${game}-v1`;
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        // localStorage is available only after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTeams(JSON.parse(stored) as SavedTeam[]);
      }
    } catch {
      setMessage("Kayıtlı takımlar okunamadı.");
    }
  }, [storageKey]);

  const persist = (nextTeams: SavedTeam[]) => {
    setTeams(nextTeams);
    localStorage.setItem(storageKey, JSON.stringify(nextTeams));
  };

  const saveTeam = () => {
    const teamName = roster.teamName.trim();
    if (!teamName) {
      setMessage("Kaydetmeden önce takıma bir isim ver.");
      return;
    }

    const existing = teams.find((team) => team.roster.teamName.toLocaleLowerCase() === teamName.toLocaleLowerCase());
    const id = existing?.id || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`);
    const nextTeams = existing
      ? teams.map((team) => team.id === id ? { id, roster: structuredClone(roster) } : team)
      : [...teams, { id, roster: structuredClone(roster) }];

    persist(nextTeams);
    setSelectedId(id);
    setMessage(existing ? "Kayıtlı takım güncellendi." : "Takım kaydedildi.");
  };

  const loadTeam = () => {
    const team = teams.find((item) => item.id === selectedId);
    if (!team) return;
    onLoad(structuredClone(team.roster));
    setMessage(`${team.roster.teamName} yüklendi.`);
  };

  const deleteTeam = () => {
    if (!selectedId) return;
    persist(teams.filter((team) => team.id !== selectedId));
    setSelectedId("");
    setMessage("Takım kayıtlarından silindi.");
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-950/50 p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <label htmlFor={`saved-team-${game}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Kayıtlı takımlar
        </label>
        <select
          id={`saved-team-${game}`}
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
        >
          <option value="">Takım seç…</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>{team.roster.teamName} · {team.roster.formation}</option>
          ))}
        </select>
      </div>
      <div className="flex shrink-0 gap-2 sm:pt-5">
        <button type="button" onClick={saveTeam} className="rounded-lg border border-emerald-900 bg-emerald-950/60 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-950">
          Takımı kaydet
        </button>
        <button type="button" onClick={loadTeam} disabled={!selectedId} className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40">
          Yükle
        </button>
        <button type="button" onClick={deleteTeam} disabled={!selectedId} aria-label="Seçili takımı sil" className="rounded-lg border border-gray-800 px-2.5 py-2 text-xs text-gray-400 hover:border-rose-900 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40">
          Sil
        </button>
      </div>
      {message && <p aria-live="polite" className="text-xs text-gray-500">{message}</p>}
    </div>
  );
}

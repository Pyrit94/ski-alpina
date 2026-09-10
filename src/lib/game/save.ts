import { makeQuests } from "./quests";
import type { GameSave, SimStats, WeatherState } from "./types";

export const SAVE_KEY = "ski-alpina-save";
export const SAVE_VERSION = 1;

export const DEFAULT_STATS: SimStats = {
  peoplePerHour: 0,
  satisfaction: 72,
  incomePerHour: 0,
  revenuePerHour: 0,
  upkeepPerHour: 0,
  visitorsToday: 0,
  visitorsTotal: 0,
  occupancy: 0,
  waitMinutes: 4,
  pisteKm: 0,
  beds: 0,
  liftCapacity: 0,
  queued: 0,
  demandPerHour: 0,
  idleLifts: 0,
  idlePistes: 0,
  verticalPerHour: 0,
  bottleneckLabel: "",
  bottleneckId: "",
  bottleneckUse: 0,
};

export const DEFAULT_WEATHER: WeatherState = {
  kind: "sun",
  tempC: -6,
  snowQuality: 0.86,
  live: false,
  label: "Klar, Pulver",
};

export function newSave(): GameSave {
  return {
    version: SAVE_VERSION,
    roomId: "zermatt",
    resortName: "Ski Builder",
    coins: 62000,
    gems: 40,
    stars: 0,
    xp: 0,
    season: 1,
    day: 1,
    timeOfDay: 0.34,
    ticketPrice: 74,
    buildings: [
      {
        id: "seed-ticket",
        itemId: "ticket",
        q: -2,
        r: 11,
        level: 1,
        builtAt: 0,
        readyAt: 0,
        upgrades: { speed: 1, cabins: 1, capacity: 1 },
      },
      {
        id: "seed-hut",
        itemId: "hut",
        q: -1,
        r: 10,
        level: 1,
        builtAt: 0,
        readyAt: 0,
        upgrades: { speed: 1, cabins: 1, capacity: 1 },
      },
    ],
    lifts: [],
    pistes: [],
    quests: makeQuests(),
    tutorialStep: 0,
    tutorialOpen: true,
    weather: { ...DEFAULT_WEATHER },
    flow: [],
    stats: { ...DEFAULT_STATS },
    unlocked: [],
  };
}

function migrate(raw: GameSave): GameSave {
  const base = newSave();
  return {
    ...base,
    ...raw,
    version: SAVE_VERSION,
    weather: { ...base.weather, ...raw.weather },
    stats: { ...base.stats, ...raw.stats },
    buildings: raw.buildings ?? base.buildings,
    lifts: raw.lifts ?? [],
    pistes: raw.pistes ?? [],
    quests: raw.quests?.length ? raw.quests : base.quests,
    unlocked: raw.unlocked ?? [],
  };
}

export function loadSave(): GameSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return newSave();
    const parsed = JSON.parse(raw) as GameSave;
    return migrate(parsed);
  } catch {
    return newSave();
  }
}

export function writeSave(save: GameSave) {
  try {
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) localStorage.setItem(SAVE_KEY + ":bak", prev);
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* private mode / quota */
  }
}

export function exportSave(save: GameSave) {
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${save.resortName.replace(/\s+/g, "-").toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function hasSave() {
  try {
    return Boolean(localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

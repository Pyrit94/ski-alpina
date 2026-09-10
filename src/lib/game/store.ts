import { create } from "zustand";
import { getHeightmap } from "./alpine";
import { BY_ID, isLift, isPiste, levelFromXp, liftThroughput, UPGRADES } from "./catalog";
import { hexDistance, hexKey, hexLine, hexToWorld, worldToHex } from "./hex";
import { syncQuestProgress } from "./quests";
import { loadSave, newSave, writeSave } from "./save";
import type {
  BuildPhase,
  Category,
  GameSave,
  HudSheet,
  ItemId,
  MapLayer,
  NotificationItem,
  PisteDifficulty,
  Tool,
} from "./types";
import { uid } from "./format";
import { cycleWeather } from "./weather";

export interface UiState {
  selectedId: string | null;
  buildItem: ItemId | null;
  category: Category;
  phase: BuildPhase;
  liftStart: { q: number; r: number } | null;
  pisteDraft: { q: number; r: number }[];
  hover: { q: number; r: number; valid: boolean; reason: string } | null;
  layer: MapLayer;
  tool: Tool;
  notifications: NotificationItem[];
  sheet: HudSheet;
  started: boolean;
  quality: "low" | "high";
}

export interface GameStore extends GameSave, UiState {
  tick: (dt: number) => void;
  startGame: (fresh: boolean) => void;
  setBuildItem: (id: ItemId | null) => void;
  setCategory: (c: UiState["category"]) => void;
  setLayer: (l: MapLayer) => void;
  setTool: (t: Tool) => void;
  hoverHex: (q: number, r: number) => void;
  clickHex: (q: number, r: number) => void;
  selectEntity: (id: string | null) => void;
  cancelBuild: () => void;
  finishPiste: () => void;
  upgrade: (id: string, key: "speed" | "cabins" | "capacity") => void;
  claimQuest: (id: string) => void;
  dismissTutorial: () => void;
  nextTutorial: () => void;
  pushNote: (title: string, body: string, kind?: NotificationItem["kind"]) => void;
  persist: () => void;
  applyWeather: (w: GameSave["weather"]) => void;
  setStarted: (v: boolean) => void;
  setSheet: (v: HudSheet) => void;
  rename: (name: string) => void;
  occupied: () => Set<string>;
}

const occupiedSet = (s: GameSave) => {
  const set = new Set<string>();
  for (const b of s.buildings) set.add(hexKey(b.q, b.r));
  for (const l of s.lifts) {
    set.add(hexKey(l.a.q, l.a.r));
    set.add(hexKey(l.b.q, l.b.r));
  }
  return set;
};

function validateHex(s: GameStore, q: number, r: number, itemId: ItemId): { ok: boolean; reason: string } {
  const item = BY_ID[itemId];
  const { x, z } = hexToWorld(q, r);
  const hm = getHeightmap();
  if (Math.abs(x) > 92 || Math.abs(z) > 92) return { ok: false, reason: "Ausserhalb des Gebiets" };
  if (hm.isWater(x, z)) return { ok: false, reason: "Auf dem See" };
  const elev = hm.sample(x, z);
  const slope = hm.slope(x, z);
  if (elev < item.minElev || elev > item.maxElev) return { ok: false, reason: "Falsche Höhe" };
  if (!isPiste(itemId) && slope > item.maxSlope) return { ok: false, reason: "Zu steil" };
  if (isPiste(itemId) && slope > item.maxSlope) return { ok: false, reason: "Zu steil für diese Piste" };
  const occ = occupiedSet(s);
  if (!isPiste(itemId) && occ.has(hexKey(q, r))) return { ok: false, reason: "Belegt" };
  const lvl = levelFromXp(s.xp);
  if (lvl < item.unlockLevel) return { ok: false, reason: `Level ${item.unlockLevel}` };
  const cost = isPiste(itemId) ? item.cost : item.cost;
  if (s.coins < cost) return { ok: false, reason: "Zu teuer" };
  if ((item.gemCost ?? 0) > s.gems) return { ok: false, reason: "Zu wenig Kristalle" };
  return { ok: true, reason: "" };
}

function pisteDiff(id: ItemId): PisteDifficulty {
  if (id === "piste-red") return "red";
  if (id === "piste-black") return "black";
  if (id === "snowpark") return "park";
  return "blue";
}

function computeSim(s: GameSave, dtHours: number) {
  const clock = s.timeOfDay;
  const hour = clock * 24;
  const diurnal = hour >= 8.5 && hour <= 16.2 ? 1 : hour >= 7.5 && hour <= 17.5 ? 0.55 : 0.12;
  const weekend = s.day % 7 >= 5 ? 1.22 : 1;
  const now = Date.now();
  const liftsReady = s.lifts.filter((l) => l.readyAt <= now);
  const buildingsReady = s.buildings.filter((b) => b.readyAt <= now);

  let liftCap = 0;
  for (const l of liftsReady) {
    liftCap += liftThroughput(BY_ID[l.itemId], l.upgrades);
  }
  const pisteSeg = s.pistes.reduce((n, p) => n + Math.max(0, p.hexes.length - 1), 0);
  const pisteKm = pisteSeg * 0.085;
  const variety = new Set(s.pistes.map((p) => p.difficulty)).size;
  const beds = buildingsReady.reduce((n, b) => n + (BY_ID[b.itemId].beds ?? 0), 0);
  const restaurants = buildingsReady.filter((b) =>
    ["restaurant", "hut", "apres"].includes(b.itemId),
  ).length;
  const hotels = buildingsReady.filter((b) => b.itemId.startsWith("hotel")).length;
  const parking = buildingsReady.filter((b) => b.itemId === "parking" || b.itemId === "bus").length;
  const snowmakers = buildingsReady.filter((b) => b.itemId === "snowmaker").length;
  const lights = buildingsReady.filter((b) => b.itemId === "lights").length;
  const shop = buildingsReady.filter((b) => b.itemId === "shop" || b.itemId === "skischool").length;
  const clinic = buildingsReady.filter((b) => b.itemId === "clinic").length;
  const workshop = buildingsReady.filter((b) => b.itemId === "workshop").length;
  const viewpoints = buildingsReady.filter((b) => b.itemId === "viewpoint").length;

  const snowQ = Math.min(1, s.weather.snowQuality + snowmakers * 0.04);
  const nightBoost = lights && (hour < 8 || hour > 16) ? 0.35 : 0;
  const demand =
    70 *
    Math.max(1, levelFromXp(s.xp)) *
    diurnal *
    weekend *
    snowQ *
    (0.55 + Math.min(1.4, liftCap / 1800)) *
    (0.7 + Math.min(0.5, pisteKm / 8)) *
    (1 + nightBoost);

  const wait = liftCap <= 0 ? 18 : Math.max(1.2, 14 * (demand / Math.max(400, liftCap)));
  const amenity =
    48 +
    restaurants * 4 +
    hotels * 5 +
    shop * 3 +
    viewpoints * 3 +
    clinic * 4 +
    variety * 6 +
    Math.min(12, pisteKm * 2);
  const crowdPenalty = Math.min(28, wait * 1.6);
  const weatherPenalty = s.weather.kind === "storm" ? 18 : s.weather.kind === "fog" ? 10 : 0;
  const satisfaction = Math.max(32, Math.min(99, amenity - crowdPenalty - weatherPenalty + snowQ * 12));

  const throughput = liftCap <= 0 ? 0 : Math.min(liftCap, demand) * (0.55 + satisfaction / 220);
  const ticket = 38 * (0.7 + satisfaction / 250);
  const liftIncome = throughput * ticket;
  const occ = beds <= 0 ? 0 : Math.min(1, (demand * 0.35) / Math.max(20, beds));
  const hotelIncome = beds * occ * 22;
  const gastro = restaurants * (40 + throughput * 0.08);
  const maint =
    liftsReady.length * 90 +
    buildingsReady.length * 18 +
    pisteSeg * 6 -
    workshop * 40;
  const trafficPenalty = Math.max(0, demand * 0.02 - parking * 80);
  const income = Math.max(0, liftIncome + hotelIncome + gastro - maint - trafficPenalty);

  const peoplePerHour = Math.round(throughput);
  const visitorsAdd = peoplePerHour * (dtHours * 8);
  const coinsDelta = income * dtHours * 8;

  return {
    peoplePerHour,
    satisfaction: Math.round(satisfaction),
    incomePerHour: Math.round(income),
    visitorsToday: s.stats.visitorsToday + visitorsAdd,
    visitorsTotal: s.stats.visitorsTotal + visitorsAdd,
    occupancy: occ,
    waitMinutes: Math.round(wait * 10) / 10,
    pisteKm: Math.round(pisteKm * 10) / 10,
    beds,
    liftCapacity: liftCap,
    coinsDelta,
  };
}

let accDay = 0;

export const useGame = create<GameStore>((set, get) => ({
  ...newSave(),
  selectedId: null,
  buildItem: null,
  category: "lifts",
  phase: "idle",
  liftStart: null,
  pisteDraft: [],
  hover: null,
  layer: "3d",
  tool: "select",
  notifications: [
    {
      id: "n0",
      title: "Willkommen in Alpina",
      body: "Verbinde die ersten Hütten mit einer Bahn und starte in die Saison.",
      kind: "info",
      at: Date.now(),
    },
  ],
  sheet: "none",
  started: false,
  quality: typeof window !== "undefined" && window.innerWidth < 1024 ? "low" : "high",

  occupied: () => occupiedSet(get()),

  startGame: (fresh) => {
    const save = fresh ? newSave() : loadSave();
    const phone = typeof window !== "undefined" && window.innerWidth < 1024;
    set({
      ...save,
      started: true,
      selectedId: null,
      buildItem: null,
      phase: "idle",
      liftStart: null,
      pisteDraft: [],
      hover: null,
      sheet: "none",
      tool: phone ? "orbit" : "select",
    });
  },

  setStarted: (v) => set({ started: v }),
  setSheet: (v) => set({ sheet: v }),
  rename: (name) => set({ resortName: name.slice(0, 28) }),
  setCategory: (c) => set({ category: c }),
  setLayer: (l) => set({ layer: l }),
  setTool: (t) => set({ tool: t, buildItem: t === "select" ? get().buildItem : get().buildItem }),
  applyWeather: (w) => set({ weather: w }),

  persist: () => {
    const s = get();
    writeSave({
      version: s.version,
      resortName: s.resortName,
      coins: s.coins,
      gems: s.gems,
      stars: s.stars,
      xp: s.xp,
      season: s.season,
      day: s.day,
      timeOfDay: s.timeOfDay,
      buildings: s.buildings,
      lifts: s.lifts,
      pistes: s.pistes,
      quests: s.quests,
      tutorialStep: s.tutorialStep,
      tutorialOpen: s.tutorialOpen,
      weather: s.weather,
      stats: s.stats,
      unlocked: s.unlocked,
    });
  },

  pushNote: (title, body, kind = "info") =>
    set((s) => ({
      notifications: [{ id: uid("n"), title, body, kind, at: Date.now() }, ...s.notifications].slice(0, 8),
    })),

  setBuildItem: (id) => {
    if (!id) {
      set({ buildItem: null, phase: "idle", liftStart: null, pisteDraft: [], sheet: "none" });
      return;
    }
    const item = BY_ID[id];
    const lvl = levelFromXp(get().xp);
    if (lvl < item.unlockLevel) {
      get().pushNote("Noch gesperrt", `Erreiche Level ${item.unlockLevel}, um ${item.name} zu bauen.`, "warn");
      return;
    }
    let phase: BuildPhase = "place";
    if (isLift(id)) phase = "lift-a";
    if (isPiste(id)) phase = "piste";
    set({
      buildItem: id,
      phase,
      liftStart: null,
      pisteDraft: [],
      selectedId: null,
      tool: "select",
      sheet: "none",
    });
  },

  cancelBuild: () =>
    set({
      buildItem: null,
      phase: "idle",
      liftStart: null,
      pisteDraft: [],
      hover: null,
    }),

  hoverHex: (q, r) => {
    const s = get();
    if (!s.buildItem) {
      set({ hover: { q, r, valid: true, reason: "" } });
      return;
    }
    const v = validateHex(s, q, r, s.buildItem);
    set({ hover: { q, r, valid: v.ok, reason: v.reason } });
  },

  selectEntity: (id) => set({ selectedId: id, buildItem: null, phase: "idle", pisteDraft: [], liftStart: null }),

  clickHex: (q, r) => {
    const s = get();
    if (s.phase === "idle" || !s.buildItem) {
      const hit =
        s.buildings.find((b) => b.q === q && b.r === r) ||
        s.lifts.find((l) => (l.a.q === q && l.a.r === r) || (l.b.q === q && l.b.r === r));
      set({ selectedId: hit?.id ?? null });
      return;
    }

    const item = BY_ID[s.buildItem];
    const v = validateHex(s, q, r, s.buildItem);

    if (s.phase === "place") {
      if (!v.ok) {
        get().pushNote("Nicht möglich", v.reason, "warn");
        return;
      }
      const now = Date.now();
      const b = {
        id: uid("b"),
        itemId: s.buildItem,
        q,
        r,
        level: 1,
        builtAt: now,
        readyAt: now + item.buildSeconds * 1000,
        upgrades: { speed: 1, cabins: 1, capacity: 1 },
      };
      set({
        buildings: [...s.buildings, b],
        coins: s.coins - item.cost,
        gems: s.gems - (item.gemCost ?? 0),
        xp: s.xp + item.xp,
        stars: s.stars + (item.xp >= 40 ? 1 : 0),
        selectedId: b.id,
        phase: "idle",
        buildItem: null,
      });
      get().pushNote("Im Bau", `${item.name} wird errichtet.`, "ok");
      return;
    }

    if (s.phase === "lift-a") {
      if (!v.ok) {
        get().pushNote("Station unmöglich", v.reason, "warn");
        return;
      }
      set({ liftStart: { q, r }, phase: "lift-b" });
      get().pushNote("Zweite Station", "Wähle die Gegenstation.", "info");
      return;
    }

    if (s.phase === "lift-b" && s.liftStart) {
      if (!v.ok) {
        get().pushNote("Station unmöglich", v.reason, "warn");
        return;
      }
      const dist = hexDistance(s.liftStart, { q, r });
      if (dist < (item.minSpan ?? 4)) {
        get().pushNote("Zu kurz", "Die Bahn braucht mehr Abstand.", "warn");
        return;
      }
      if (dist > (item.maxSpan ?? 24)) {
        get().pushNote("Zu weit", "Wähle eine nähere Station.", "warn");
        return;
      }
      const now = Date.now();
      const stationA = uid("st");
      const stationB = uid("st");
      const liftId = uid("l");
      const a = {
        id: stationA,
        itemId: s.buildItem,
        q: s.liftStart.q,
        r: s.liftStart.r,
        level: 1,
        builtAt: now,
        readyAt: now + item.buildSeconds * 1000,
        upgrades: { speed: 1, cabins: 1, capacity: 1 },
      };
      const b = {
        ...a,
        id: stationB,
        q,
        r,
      };
      set({
        buildings: [...s.buildings, a, b],
        lifts: [
          ...s.lifts,
          {
            id: liftId,
            itemId: s.buildItem,
            a: { ...s.liftStart },
            b: { q, r },
            stationA,
            stationB,
            level: 1,
            builtAt: now,
            readyAt: now + item.buildSeconds * 1000,
            upgrades: { speed: 1, cabins: 1, capacity: 1 },
          },
        ],
        coins: s.coins - item.cost,
        gems: s.gems - (item.gemCost ?? 0),
        xp: s.xp + item.xp,
        stars: s.stars + 1,
        selectedId: liftId,
        phase: "idle",
        buildItem: null,
        liftStart: null,
      });
      get().pushNote("Bahn im Bau", `${item.name} verbindet die Hänge.`, "ok");
      return;
    }

    if (s.phase === "piste") {
      const draft = s.pisteDraft;
      if (draft.length === 0) {
        if (!v.ok && v.reason !== "Belegt") {
          get().pushNote("Start unmöglich", v.reason, "warn");
          return;
        }
        set({ pisteDraft: [{ q, r }] });
        return;
      }
      const last = draft[draft.length - 1]!;
      const line = hexLine(last, { q, r }).slice(1);
      const hm = getHeightmap();
      const lastW = hexToWorld(last.q, last.r);
      const nextW = hexToWorld(q, r);
      const downhill = hm.sample(nextW.x, nextW.z) <= hm.sample(lastW.x, lastW.z) + 18 || s.buildItem === "road";
      if (!downhill && s.buildItem !== "road") {
        get().pushNote("Piste muss talwärts", "Wähle einen tieferen Punkt.", "warn");
        return;
      }
      const cost = item.cost * line.length;
      if (s.coins < cost) {
        get().pushNote("Zu teuer", `Noch ${cost} Münzen nötig.`, "warn");
        return;
      }
      set({
        pisteDraft: [...draft, ...line],
        coins: s.coins - cost,
        xp: s.xp + item.xp * line.length,
      });
    }
  },

  finishPiste: () => {
    const s = get();
    if (s.pisteDraft.length < 2 || !s.buildItem) return;
    const item = BY_ID[s.buildItem];
    const now = performance.now();
    const p = {
      id: uid("p"),
      difficulty: pisteDiff(s.buildItem),
      hexes: s.pisteDraft,
      builtAt: now,
      readyAt: now + item.buildSeconds * 1000,
    };
    set({
      pistes: [...s.pistes, p],
      pisteDraft: [],
      phase: "idle",
      buildItem: null,
      selectedId: p.id,
    });
    get().pushNote("Piste geöffnet", `${item.name} ist bereit.`, "ok");
  },

  upgrade: (id, key) => {
    const s = get();
    const def = UPGRADES.find((u) => u.key === key);
    if (!def) return;
    const lift = s.lifts.find((l) => l.id === id);
    const b = s.buildings.find((x) => x.id === id);
    const target = lift ?? b;
    if (!target) return;
    const cur = target.upgrades[key];
    if (cur >= def.max) return;
    const cost = def.cost[cur] ?? 999999;
    if (s.coins < cost) {
      get().pushNote("Zu teuer", `${def.label} kostet ${cost}.`, "warn");
      return;
    }
    const next = cur + 1;
    set({
      coins: s.coins - cost,
      xp: s.xp + 12,
      lifts: s.lifts.map((l) =>
        l.id === id ? { ...l, upgrades: { ...l.upgrades, [key]: next }, level: Math.max(l.level, next) } : l,
      ),
      buildings: s.buildings.map((x) =>
        x.id === id ? { ...x, upgrades: { ...x.upgrades, [key]: next }, level: Math.max(x.level, next) } : x,
      ),
    });
    get().pushNote("Upgrade", `${def.label} auf Stufe ${next}.`, "ok");
  },

  claimQuest: (id) => {
    const s = get();
    const q = s.quests.find((x) => x.id === id);
    if (!q || q.claimed || q.progress < q.target) return;
    set({
      coins: s.coins + q.coins,
      gems: s.gems + q.gems,
      xp: s.xp + q.xp,
      stars: s.stars + 1,
      quests: s.quests.map((x) => (x.id === id ? { ...x, claimed: true } : x)),
    });
    get().pushNote("Belohnung", `${q.title} abgeschlossen.`, "ok");
  },

  dismissTutorial: () => set({ tutorialOpen: false }),
  nextTutorial: () =>
    set((s) => ({
      tutorialStep: Math.min(3, s.tutorialStep + 1),
      tutorialOpen: s.tutorialStep + 1 < 4,
    })),

  tick: (dt) => {
    const s = get();
    if (!s.started) return;
    const timeOfDay = (s.timeOfDay + dt / 90) % 1;
    let day = s.day;
    let season = s.season;
    let weather = s.weather;
    accDay += dt;
    let rolled = false;
    if (timeOfDay < s.timeOfDay) {
      day += 1;
      rolled = true;
      if (day > 90) {
        day = 1;
        season += 1;
      }
      if (Math.random() > 0.55 && !weather.live) {
        weather = cycleWeather(weather.kind, Math.random());
      }
    }
    const dtHours = (dt * 24) / 90 / 24;
    const sim = computeSim({ ...s, timeOfDay, day, season, weather }, dtHours);
    const coins = s.coins + sim.coinsDelta;
    const stats = {
      peoplePerHour: sim.peoplePerHour,
      satisfaction: sim.satisfaction,
      incomePerHour: sim.incomePerHour,
      visitorsToday: rolled ? 0 : sim.visitorsToday,
      visitorsTotal: sim.visitorsTotal,
      occupancy: sim.occupancy,
      waitMinutes: sim.waitMinutes,
      pisteKm: sim.pisteKm,
      beds: sim.beds,
      liftCapacity: sim.liftCapacity,
    };
    const quests = syncQuestProgress({ ...s, stats, coins });
    const prevLevel = levelFromXp(s.xp);
    const nextLevel = levelFromXp(s.xp);
    set({ timeOfDay, day, season, weather, coins, stats, quests });
    if (nextLevel > prevLevel) {
      get().pushNote("Level auf", `Level ${nextLevel} erreicht. Neue Bauten warten.`, "ok");
    }
  },
}));

export function worldClickToHex(x: number, z: number) {
  return worldToHex(x, z);
}

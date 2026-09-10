import { create } from "zustand";
import { BY_ID, isLift, isPiste } from "@ski/config";
import {
  hexDistance,
  hexLine,
  validateHex,
  validatePistePath,
  getDem,
  levelFromXp,
  worldToHex,
  type BuildPhase,
  type HudSheet,
  type Intent,
  type MapLayer,
  type PlayerPresence,
  type ResortState,
  type Tool,
} from "@ski/shared";
import type { Category, ItemId } from "../../../packages/config/src/ids.ts";
import { connectGame, loadName, saveName } from "./net";
import { emptyResort } from "@ski/shared";
import type { NotificationItem } from "./types";

type Net = ReturnType<typeof connectGame>;

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
  connected: boolean;
  players: PlayerPresence[];
  playerId: string | null;
  playerName: string;
  roomId: string;
  stampMode: boolean;
  lastStampAt: number;
  lastStampHex: { q: number; r: number } | null;
}

export interface GameStore extends ResortState, UiState {
  tick: (dt: number) => void;
  startGame: (fresh: boolean, name?: string, roomId?: string) => void;
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
  demolish: (id: string) => void;
  claimQuest: (id: string) => void;
  dismissTutorial: () => void;
  nextTutorial: () => void;
  pushNote: (title: string, body: string, kind?: NotificationItem["kind"]) => void;
  persist: () => void;
  applyWeather: (w: ResortState["weather"]) => void;
  setStarted: (v: boolean) => void;
  setSheet: (v: HudSheet) => void;
  rename: (name: string) => void;
  setTicketPrice: (chf: number) => void;
  confirmHover: () => void;
  occupied: () => Set<string>;
}

let net: Net | null = null;

function flatten(s: ResortState): Partial<ResortState> {
  return {
    version: s.version,
    roomId: s.roomId,
    resortName: s.resortName,
    coins: s.coins,
    gems: s.gems,
    stars: s.stars,
    xp: s.xp,
    season: s.season,
    day: s.day,
    timeOfDay: s.timeOfDay,
    ticketPrice: s.ticketPrice,
    buildings: s.buildings,
    lifts: s.lifts,
    pistes: s.pistes,
    quests: s.quests,
    tutorialStep: s.tutorialStep,
    tutorialOpen: s.tutorialOpen,
    weather: s.weather,
    stats: s.stats,
    flow: s.flow,
    unlocked: s.unlocked,
  };
}

const empty = emptyResort("zermatt");

function isPhone() {
  return typeof window !== "undefined" && window.innerWidth < 1024;
}

export const useGame = create<GameStore>((set, get) => ({
  ...empty,
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
      title: "Willkommen",
      body: "Gemeinsam bauen: Intents gehen an den Server. Skifahrer sind nur Visualisierung.",
      kind: "info",
      at: Date.now(),
    },
  ],
  sheet: "none",
  started: false,
  quality: isPhone() ? "low" : "high",
  connected: false,
  players: [],
  playerId: null,
  playerName: "Gast",
  roomId: "zermatt",
  stampMode: isPhone(),
  lastStampAt: 0,
  lastStampHex: null,

  occupied: () => {
    const s = get();
    const setOcc = new Set<string>();
    for (const b of s.buildings) setOcc.add(`${b.q},${b.r}`);
    for (const l of s.lifts) {
      setOcc.add(`${l.a.q},${l.a.r}`);
      setOcc.add(`${l.b.q},${l.b.r}`);
    }
    return setOcc;
  },

  startGame: (fresh, name, roomId) => {
    const playerName = (name || loadName()).trim() || "Gast";
    saveName(playerName);
    const room = roomId || (fresh ? `resort-${Date.now().toString(36).slice(-6)}` : "zermatt");
    net?.close();
    const phone = isPhone();
    set({
      started: true,
      playerName,
      roomId: room,
      selectedId: null,
      buildItem: null,
      phase: "idle",
      liftStart: null,
      pisteDraft: [],
      hover: null,
      sheet: "none",
      tool: phone ? "pan" : "select",
      stampMode: phone,
      connected: false,
      lastStampAt: 0,
      lastStampHex: null,
    });
    net = connectGame(room, playerName, {
      onWelcome: (playerId, _token, rid) => set({ playerId, roomId: rid }),
      onSnapshot: (state, players) => set({ ...flatten(state), players }),
      onEvent: (title, body, kind) => get().pushNote(title, body, kind),
      onError: (reason) => get().pushNote("Nicht möglich", reason, "warn"),
      onStatus: (connected) => set({ connected }),
    });
  },

  setStarted: (v) => set({ started: v }),
  setSheet: (v) => set({ sheet: v }),
  rename: (name) => {
    set({ resortName: name.slice(0, 28) });
    net?.sendIntent({ type: "rename", name: name.slice(0, 28) });
  },
  setTicketPrice: (chf) => net?.sendIntent({ type: "set_ticket_price", chf }),
  setCategory: (c) => set({ category: c }),
  setLayer: (l) => set({ layer: l }),
  setTool: (t) => set({ tool: t }),
  applyWeather: (w) => set({ weather: w }),
  persist: () => {
    /* server persists */
  },

  pushNote: (title, body, kind = "info") =>
    set((s) => ({
      notifications: [{ id: `n_${Date.now()}`, title, body, kind, at: Date.now() }, ...s.notifications].slice(0, 8),
    })),

  setBuildItem: (id) => {
    if (!id) {
      set({
        buildItem: null,
        phase: "idle",
        liftStart: null,
        pisteDraft: [],
        sheet: "none",
        tool: get().stampMode ? "pan" : "select",
      });
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
      tool: get().stampMode ? "pan" : "select",
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
      tool: get().stampMode ? "pan" : "select",
    }),

  hoverHex: (q, r) => {
    const s = get();
    if (s.hover && s.hover.q === q && s.hover.r === r) return;
    if (!s.buildItem) {
      set({ hover: { q, r, valid: true, reason: "" } });
      return;
    }
    const v = validateHex(s, getDem(), q, r, s.buildItem);
    set({ hover: { q, r, valid: v.ok, reason: v.ok ? "" : v.reason } });
  },

  confirmHover: () => {
    const s = get();
    if (!s.hover || s.phase === "idle" || !s.buildItem) return;
    if (s.hover.valid && (s.phase === "place" || s.phase === "lift-a" || s.phase === "lift-b" || s.phase === "piste")) {
      set({ lastStampAt: Date.now(), lastStampHex: { q: s.hover.q, r: s.hover.r } });
    }
    get().clickHex(s.hover.q, s.hover.r);
  },

  selectEntity: (id) => set({ selectedId: id, buildItem: null, phase: "idle", pisteDraft: [], liftStart: null }),

  clickHex: (q, r) => {
    const s = get();
    if (s.phase === "idle" || !s.buildItem) {
      // Pistes were not selectable at all, so a run could never be inspected
      // or torn down. Buildings and stations win the hex; a run is what is
      // left underneath.
      const hit =
        s.buildings.find((b) => b.q === q && b.r === r) ||
        s.lifts.find((l) => (l.a.q === q && l.a.r === r) || (l.b.q === q && l.b.r === r)) ||
        s.pistes.find((p) => p.hexes.some((h) => h.q === q && h.r === r));
      set({ selectedId: hit?.id ?? null });
      return;
    }
    const item = BY_ID[s.buildItem];
    const v = validateHex(s, getDem(), q, r, s.buildItem);

    if (s.phase === "place") {
      if (!v.ok) {
        get().pushNote("Nicht möglich", v.reason, "warn");
        return;
      }
      const intent: Intent = { type: "place_building", itemId: s.buildItem, q, r };
      net?.sendIntent(intent);
      set({ selectedId: null, lastStampAt: Date.now(), lastStampHex: { q, r } });
      return;
    }

    if (s.phase === "lift-a") {
      if (!v.ok) {
        get().pushNote("Station unmöglich", v.reason, "warn");
        return;
      }
      set({ liftStart: { q, r }, phase: "lift-b", lastStampAt: Date.now(), lastStampHex: { q, r } });
      get().pushNote("Zweite Station", "Schiebe die Gegenstation unter das Raster.", "info");
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
      net?.sendIntent({ type: "place_lift", itemId: s.buildItem, a: s.liftStart, b: { q, r } });
      set({ selectedId: null, phase: "lift-a", liftStart: null, lastStampAt: Date.now(), lastStampHex: { q, r } });
      return;
    }

    if (s.phase === "piste") {
      const draft = s.pisteDraft;
      if (draft.length === 0) {
        if (!v.ok && v.reason !== "Belegt") {
          get().pushNote("Start unmöglich", v.reason, "warn");
          return;
        }
        set({ pisteDraft: [{ q, r }], lastStampAt: Date.now(), lastStampHex: { q, r } });
        return;
      }
      const last = draft[draft.length - 1]!;
      const line = hexLine(last, { q, r }).slice(1);
      const candidate = [...draft, ...line];
      // Exactly the rule the server will apply to the finished run, so the
      // draft can never grow into something that gets rejected on submit.
      const path = validatePistePath(s, getDem(), s.buildItem, candidate);
      if (!path.ok) {
        get().pushNote("Nicht möglich", path.reason, "warn");
        return;
      }
      set({ pisteDraft: candidate, lastStampAt: Date.now(), lastStampHex: { q, r } });
    }
  },

  finishPiste: () => {
    const s = get();
    if (s.pisteDraft.length < 2 || !s.buildItem) return;
    net?.sendIntent({ type: "place_piste", itemId: s.buildItem, hexes: s.pisteDraft });
    set({ pisteDraft: [], phase: "piste" });
  },

  upgrade: (id, key) => net?.sendIntent({ type: "upgrade", entityId: id, key }),
  demolish: (id) => {
    net?.sendIntent({ type: "demolish", entityId: id });
    set({ selectedId: null });
  },
  claimQuest: (id) => net?.sendIntent({ type: "claim_quest", questId: id }),
  dismissTutorial: () => {
    set({ tutorialOpen: false });
    net?.sendIntent({ type: "dismiss_tutorial" });
  },
  nextTutorial: () => {
    set((s) => ({
      tutorialStep: Math.min(3, s.tutorialStep + 1),
      tutorialOpen: s.tutorialStep + 1 < 4,
    }));
    net?.sendIntent({ type: "next_tutorial" });
  },
  tick: () => {
    /* authoritative sim ticks on the server */
  },
}));

export function worldClickToHex(x: number, z: number) {
  return worldToHex(x, z);
}

import { create } from "zustand";
import { BY_ID, CATALOG, isLift, isPiste } from "@ski/config";
import {
  hexDistance,
  hexLine,
  MAX_PISTE_HEXES,
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
import { play } from "./sound";
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
  /** Photo textures from public/textures/pbr, when present. Per device. */
  photoTextures: boolean;
  connected: boolean;
  players: PlayerPresence[];
  playerId: string | null;
  playerName: string;
  roomId: string;
  /** Whether a snapshot has arrived since joining. */
  connectedOnce: boolean;
  stampMode: boolean;
  lastStampAt: number;
  lastStampHex: { q: number; r: number } | null;
  /** Rounds whose report the player has already seen. */
  seenReportRound: number;
  /** The match setup dialog. */
  matchSetupOpen: boolean;
  /** Chat lines already read, by count. */
  chatSeen: number;
  /** Next map click places a marker of this kind instead of selecting. */
  markMode: "look" | "build" | "warn" | null;
  /** Bumped when something deserves a celebration; the value says what. */
  celebrate: { id: number; title: string; body: string } | null;
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
  startMatch: (preset: "kurz" | "normal" | "lang" | "sandbox") => void;
  endRound: (ready: boolean) => void;
  chooseEvent: (option: number) => void;
  setMatchSetupOpen: (open: boolean) => void;
  setPhotoTextures: (on: boolean) => void;
  sendChat: (text: string) => void;
  markChatRead: () => void;
  setMarkMode: (kind: "look" | "build" | "warn" | null) => void;
  markReportSeen: (round: number) => void;
  clearCelebration: () => void;
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
    contributors: s.contributors,
    activity: s.activity,
    match: s.match,
    hallOfFame: s.hallOfFame,
    chat: s.chat ?? [],
  };
}

const empty = emptyResort("zermatt");

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = typeof window === "undefined" ? null : localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

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
  notifications: [],
  sheet: "none",
  started: false,
  quality: isPhone() ? "low" : "high",
  photoTextures: readFlag("ski-alpina-photo-textures", true),
  connected: false,
  players: [],
  playerId: null,
  playerName: "Gast",
  roomId: "zermatt",
  connectedOnce: false,
  stampMode: isPhone(),
  lastStampAt: 0,
  lastStampHex: null,
  seenReportRound: -1,
  chatSeen: 0,
  markMode: null,
  matchSetupOpen: false,
  celebrate: null,

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
      connectedOnce: false,
      lastStampAt: 0,
      lastStampHex: null,
    });
    net = connectGame(room, playerName, {
      onWelcome: (playerId, _token, rid) => set({ playerId, roomId: rid }),
      onSnapshot: (state, players) => {
        const prev = get();
        const before = levelFromXp(prev.xp);
        const after = levelFromXp(state.xp);
        // The first snapshot after joining only sets the baseline: a report
        // or level-up from before you arrived is not news.
        const first = !prev.connectedOnce;
        const reports = state.match?.history.length ?? 0;
        const chat = state.chat ?? [];
        set({
          ...flatten(state),
          players,
          connectedOnce: true,
          ...(first ? { seenReportRound: reports } : {}),
        });
        // A new line from someone else: a toast and a soft click, unless the
        // chat is open anyway.
        const fresh = chat.slice(prev.chat?.length ?? 0).filter((c) => c.actor !== prev.playerId);
        if (!first && fresh.length > 0) {
          const lastLine = fresh[fresh.length - 1]!;
          if (get().sheet !== "chat") {
            play("click");
            get().pushNote(lastLine.actorName, lastLine.text, "info");
          }
        }
        if (first || get().sheet === "chat") set({ chatSeen: chat.length });
        if (!first && reports > prev.match.history.length) {
          play(state.match.history[reports - 1]?.medal ? "medal" : "round");
        }
        if (!first && after > before) {
          play("levelup");
          const unlocked = CATALOG.filter((i) => i.unlockLevel === after).map((i) => i.name);
          set({
            celebrate: {
              id: Date.now(),
              title: `Level ${after}`,
              body: unlocked.length ? `Neu freigeschaltet: ${unlocked.join(", ")}` : "Weiter so!",
            },
          });
        }
      },
      onEvent: (title, body, kind, actorId, actorName) => {
        // Name the other builder; own actions need no attribution.
        const mine = !actorId || actorId === get().playerId;
        if (mine && kind === "ok" && actorId) play("build");
        get().pushNote(title, mine || !actorName ? body : `${actorName}: ${body}`, kind);
      },
      onError: (reason) => {
        play("error");
        get().pushNote("Nicht möglich", reason, "warn");
      },
      onStatus: (connected) => set({ connected }),
    });
  },

  setStarted: (v) => set({ started: v }),
  startMatch: (preset) => {
    net?.sendIntent({ type: "start_match", preset });
    set({ matchSetupOpen: false, selectedId: null, sheet: "none" });
  },
  endRound: (ready) => net?.sendIntent({ type: "end_round", ready }),
  chooseEvent: (option) => net?.sendIntent({ type: "choose_event", option }),
  setMatchSetupOpen: (open) => set({ matchSetupOpen: open }),
  sendChat: (text) => {
    const clean = text.trim().slice(0, 200);
    if (clean) net?.sendChat(clean);
  },
  markChatRead: () => set((s) => ({ chatSeen: s.chat.length })),
  setMarkMode: (kind) =>
    set({ markMode: kind, buildItem: null, phase: "idle", pisteDraft: [], liftStart: null, selectedId: null, sheet: "none" }),
  setPhotoTextures: (on) => {
    writeFlag("ski-alpina-photo-textures", on);
    set({ photoTextures: on });
  },
  markReportSeen: (round) => set({ seenReportRound: round }),
  clearCelebration: () => set({ celebrate: null }),
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
    // Let the other builders see where the work is happening.
    net?.sendFocus({ q, r });
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
    if (s.markMode) {
      net?.sendMark({ q, r }, s.markMode);
      play("click");
      set({ markMode: null });
      return;
    }
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
      if (candidate.length > MAX_PISTE_HEXES) {
        get().pushNote("Zu lang", `Eine Piste hat höchstens ${MAX_PISTE_HEXES - 1} Felder. Tippe «Fertig» und zeichne weiter.`, "warn");
        return;
      }
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

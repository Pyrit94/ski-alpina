import { create } from "zustand";
import { BY_ID, CATALOG, RESEARCH_BY_ID, RESEARCH_GATE, isLift, isPiste } from "@ski/config";
import {
  hexDistance,
  validateHex,
  getDem,
  itemUnlocked,
  lockReason,
  levelFromXp,
  worldToHex,
  type BuildPhase,
  type GameInfo,
  type HudSheet,
  type Intent,
  type MapLayer,
  type MatchOptions,
  type PlayerPresence,
  type ResortState,
  type Tool,
} from "@ski/shared";
import type { Category, ItemId } from "../../../packages/config/src/ids.ts";
import { connectGame, loadName, saveName } from "./net";
import { play } from "./sound";
import { finishPisteDraft, pisteClick } from "./piste-editor";
import { emptyResort, loadRegion, setActiveRegion, TUTORIAL_STEPS } from "@ski/shared";
import { CLASSIC_REGION } from "@ski/config";
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
  /** Ask the scene for an album photo of this round. */
  albumRequest: { roomId: string; matchStartedAt: number; round: number } | null;
  /** Chat lines already read, by count. */
  chatSeen: number;
  /** Next map click places a marker of this kind instead of selecting. */
  markMode: "look" | "build" | "warn" | null;
  /** Bumped when something deserves a celebration; the value says what. */
  celebrate: { id: number; title: string; body: string; kicker?: string } | null;
}

export interface GameStore extends ResortState, UiState {
  tick: (dt: number) => void;
  startGame: (fresh: boolean, name?: string, roomId?: string) => void;
  /** Games and their saves, as last heard from the server. */
  games: GameInfo[];
  refreshGames: () => void;
  saveGame: (name: string) => void;
  loadSave: (saveId: string) => void;
  deleteSave: (saveId: string) => void;
  /** Back to the start screen, to pick another game. */
  leaveGame: () => void;
  /** The map whose ground is loaded and active; the scene waits for it. */
  regionReady: string | null;
  /** Where the camera should glide to next (world x/z), with a serial. */
  cameraFocus: { x: number; z: number; id: number } | null;
  /** The new lift the «noch keine Abfahrt» card is offering a run for. */
  descentOffer: string | null;
  /** «Pisten automatisch» while open: which lifts (null = all) and which grades. */
  autoPistes: { liftIds: string[] | null; mix: "mixed" | "blue" | "red" | "black" } | null;
  /** Research node to open the research panel on, when a locked card asks. */
  researchFocus: string | null;
  /** The runs it would build, for the map. */
  autoPreview: { hexes: { q: number; r: number }[]; grade: string }[];
  focusOn: (x: number, z: number) => void;
  setBuildItem: (id: ItemId | null) => void;
  setCategory: (c: UiState["category"]) => void;
  setLayer: (l: MapLayer) => void;
  setTool: (t: Tool) => void;
  hoverHex: (q: number, r: number) => void;
  clickHex: (q: number, r: number) => void;
  selectEntity: (id: string | null) => void;
  cancelBuild: () => void;
  finishPiste: () => void;
  /** Send an intent as-is; for editors that build their own (see piste-editor.ts). */
  sendIntent: (intent: Intent) => void;
  upgrade: (id: string, key: "speed" | "cabins" | "capacity") => void;
  /** Take back your own build: full price, within the undo window. */
  undo: (id: string) => void;
  /** Pick a building up to put it somewhere else. */
  startMove: (id: string) => void;
  /** The building being moved, while the raster looks for its new place. */
  movingId: string | null;
  setSpeed: (speed: 0 | 1 | 3) => void;
  nameLift: (id: string, name: string) => void;
  /** Next level of a building or run. */
  expand: (id: string) => void;
  /** Leave the rounds and keep playing this valley on the clock. */
  freePlay: () => void;
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
  startMatch: (preset: "kurz" | "normal" | "lang" | "sandbox", options?: Partial<MatchOptions>) => void;
  setMatchOptions: (options: Partial<MatchOptions>) => void;
  chooseRole: (role: "berg" | "tal") => void;
  transferCoins: (to: string, amount: number) => void;
  endRound: (ready: boolean) => void;
  chooseEvent: (option: number) => void;
  setMatchSetupOpen: (open: boolean) => void;
  setPhotoTextures: (on: boolean) => void;
  sendChat: (text: string) => void;
  markChatRead: () => void;
  setMarkMode: (kind: "look" | "build" | "warn" | null) => void;
  markReportSeen: (round: number) => void;
  clearCelebration: () => void;
  startResearch: (nodeId: string) => void;
  /** Without a node: stop the running one. With one: take it out of the queue. */
  cancelResearch: (nodeId?: string) => void;
  pledgeResearch: (nodeId: string) => void;
  boostResearch: () => void;
}

let net: Net | null = null;

function flatten(s: ResortState): Partial<ResortState> {
  return {
    version: s.version,
    roomId: s.roomId,
    resortName: s.resortName,
    region: s.region ?? CLASSIC_REGION,
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
    research: s.research,
    speed: s.speed ?? 1,
    daily: s.daily ?? [],
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
  albumRequest: null,
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
      onWelcome: (playerId, _token, rid) => {
        set({ playerId, roomId: rid });
        // Joined: now the socket is open, ask for this game's saves.
        net?.sendLobby({ type: "list_games" });
      },
      onSnapshot: (state, players) => {
        const prev = get();
        const before = levelFromXp(prev.xp);
        const after = levelFromXp(state.xp);
        // The first snapshot after joining only sets the baseline: a report
        // or level-up from before you arrived is not news.
        const first = !prev.connectedOnce;
        const reports = state.match?.history.length ?? 0;
        const chat = state.chat ?? [];
        // A new match starts its reports from zero; the count seen in the
        // previous one would otherwise hide the first reports of this one.
        const newMatch = !first && prev.match.startedAt !== state.match?.startedAt;
        // A game on a real map: its ground is loaded once, then made the
        // one every getDem() answers with. The scene waits for it.
        const region = state.region ?? CLASSIC_REGION;
        if (get().regionReady !== region) {
          void loadRegion(region).then(() => {
            setActiveRegion(region);
            set({ regionReady: region });
          });
        }
        set({
          ...flatten(state),
          players,
          connectedOnce: true,
          ...(first ? { seenReportRound: reports } : newMatch ? { seenReportRound: 0 } : {}),
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
        if (!first && reports > prev.match.history.length && state.match.options?.album) {
          const report = state.match.history[reports - 1]!;
          set({ albumRequest: { roomId: state.roomId, matchStartedAt: state.match.startedAt, round: report.round } });
        }
        if (!first && reports > prev.match.history.length) {
          play(state.match.history[reports - 1]?.medal ? "medal" : "round");
        }
        // Research finished, by the clock, a round or a partner's pledge.
        const learned = (state.research?.done ?? []).filter((id) => !(prev.research?.done ?? []).includes(id));
        if (!first && learned.length > 0) {
          const nodes = learned.map((id) => RESEARCH_BY_ID[id]).filter((n) => !!n);
          play("levelup");
          set({
            celebrate: {
              id: Date.now(),
              kicker: "Erforscht",
              title: nodes.map((n) => n.name).join(", "),
              body: nodes.map((n) => n.effectText).join(" · "),
            },
          });
        }
        // The tutorial closed itself because everything in it got done.
        if (!first && prev.tutorialOpen && !state.tutorialOpen && state.lifts.length > 0) {
          play("medal");
          set({
            celebrate: {
              id: Date.now(),
              kicker: "Geschafft",
              title: "Euer Skigebiet läuft!",
              body: "Lift rauf, Piste runter – die ersten Gäste fahren. Unten zeigt euch ein Tipp, was als Nächstes lohnt.",
            },
          });
        }
        if (!first && after > before) {
          play("levelup");
          // Only what the level itself unlocks; the rest comes from research.
          const unlocked = CATALOG.filter((i) => i.unlockLevel === after && !RESEARCH_GATE[i.id]).map((i) => i.name);
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
      onGames: (games) => set({ games }),
    });
  },

  setStarted: (v) => set({ started: v }),
  cameraFocus: null,
  regionReady: null,
  descentOffer: null,
  autoPistes: null,
  researchFocus: null,
  autoPreview: [],
  focusOn: (x, z) => set({ cameraFocus: { x, z, id: Date.now() } }),
  games: [],
  refreshGames: () => net?.sendLobby({ type: "list_games" }),
  saveGame: (name) => net?.sendLobby({ type: "save_game", ...(name.trim() ? { name: name.trim() } : {}) }),
  loadSave: (saveId) => net?.sendLobby({ type: "load_save", saveId }),
  deleteSave: (saveId) => net?.sendLobby({ type: "delete_save", saveId }),
  leaveGame: () => {
    net?.close();
    net = null;
    // A fresh page rather than unmounting the scene in place: tearing the
    // canvas down under its HTML labels throws in React, and a reload also
    // hands back the GPU memory. The start screen never joins on its own.
    if (typeof window !== "undefined") window.location.reload();
    else set({ started: false });
  },
  startMatch: (preset, options) => {
    net?.sendIntent({ type: "start_match", preset, ...(options ? { options } : {}) });
    set({ matchSetupOpen: false, selectedId: null, sheet: "none" });
  },
  endRound: (ready) => net?.sendIntent({ type: "end_round", ready }),
  setMatchOptions: (options) => net?.sendIntent({ type: "set_match_options", options }),
  chooseRole: (role) => net?.sendIntent({ type: "choose_role", role }),
  transferCoins: (to, amount) => net?.sendIntent({ type: "transfer_coins", to, amount: Math.round(amount) }),
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
  startResearch: (nodeId) => net?.sendIntent({ type: "start_research", nodeId }),
  cancelResearch: (nodeId) => net?.sendIntent(nodeId ? { type: "cancel_research", nodeId } : { type: "cancel_research" }),
  pledgeResearch: (nodeId) => net?.sendIntent({ type: "pledge_research", nodeId }),
  boostResearch: () => net?.sendIntent({ type: "boost_research" }),
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
    if (!itemUnlocked(get(), id)) {
      const why = lockReason(get(), id);
      if (why?.kind === "research") {
        // Straight to the node that unlocks it.
        set({ researchFocus: why.nodeId, sheet: "research" });
        get().pushNote("Erst erforschen", `${item.name}: ${why.text}.`, "info");
        return;
      }
      get().pushNote("Noch gesperrt", `Erreiche Level ${item.unlockLevel}, um ${item.name} zu bauen.`, "warn");
      return;
    }
    let phase: BuildPhase = "place";
    if (isLift(id)) phase = "lift-a";
    if (isPiste(id)) phase = "piste";
    set({
      movingId: null,
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
      movingId: null,
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
    const ground = s.movingId ? { ...s, buildings: s.buildings.filter((b) => b.id !== s.movingId) } : s;
    const v = validateHex(ground, getDem(), q, r, s.buildItem);
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
    // While moving, the building's own hex is free.
    const ground = s.movingId ? { ...s, buildings: s.buildings.filter((b) => b.id !== s.movingId) } : s;
    const v = validateHex(ground, getDem(), q, r, s.buildItem);

    if (s.phase === "place" && s.movingId) {
      if (!v.ok) {
        get().pushNote("Nicht möglich", v.reason, "warn");
        return;
      }
      net?.sendIntent({ type: "move_building", entityId: s.movingId, q, r });
      set({ movingId: null, buildItem: null, phase: "idle", hover: null, lastStampAt: Date.now(), lastStampHex: { q, r } });
      return;
    }

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
      // A lift is done in one go: leave building, so the camera can glide to
      // it and the advisor can offer its run straight away.
      set({
        selectedId: null,
        buildItem: null,
        phase: "idle",
        liftStart: null,
        hover: null,
        lastStampAt: Date.now(),
        lastStampHex: { q, r },
        tool: get().stampMode ? "pan" : "select",
      });
      return;
    }

    if (s.phase === "piste") {
      // Drawing, snapping and suggested routes live in the piste editor.
      pisteClick(q, r);
    }
  },

  finishPiste: () => finishPisteDraft(),
  sendIntent: (intent) => net?.sendIntent(intent),

  upgrade: (id, key) => net?.sendIntent({ type: "upgrade", entityId: id, key }),
  undo: (id) => net?.sendIntent({ type: "undo", entityId: id }),
  movingId: null,
  startMove: (id) => {
    const b = get().buildings.find((x) => x.id === id);
    if (!b) return;
    set({
      buildItem: b.itemId,
      phase: "place",
      movingId: id,
      liftStart: null,
      pisteDraft: [],
      selectedId: null,
      sheet: "none",
      tool: get().stampMode ? "pan" : "select",
    });
  },
  setSpeed: (speed) => net?.sendIntent({ type: "set_speed", speed }),
  nameLift: (id, name) => net?.sendIntent({ type: "name_lift", entityId: id, name }),
  expand: (id) => net?.sendIntent({ type: "expand", entityId: id }),
  freePlay: () => net?.sendIntent({ type: "free_play" }),
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
      tutorialStep: Math.min(TUTORIAL_STEPS - 1, s.tutorialStep + 1),
      tutorialOpen: s.tutorialStep + 1 < TUTORIAL_STEPS,
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

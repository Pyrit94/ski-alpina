import { create } from "zustand";
import { discounted, spendable } from "@ski/shared";
import { BY_ID, type PisteGrade } from "@ski/config";
import {
  MAX_PISTE_HEXES,
  extendDraft,
  getDem,
  pisteCost,
  routePiste,
  snapPisteStart,
  validateGround,
  validatePistePath,
  type Axial,
  type IntentResult,
  type PisteWidth,
  type RouteTarget,
} from "@ski/shared";
import { play } from "./sound";
import { useGame } from "./store";

/**
 * The piste editor's own state: how wide, which grade to aim for, whether
 * the player draws or lets a route be suggested, and the strokes that make
 * the draft so "Zurück" can take one back.
 *
 * The draft hexes themselves stay in the game store (`pisteDraft`), which the
 * scene already reads; everything here is about how that draft is made.
 */
export type PisteMode = "draw" | "route";

export interface PisteEditorState {
  width: PisteWidth;
  target: RouteTarget;
  mode: PisteMode;
  name: string;
  /** Draft length before each stroke or segment; "Zurück" returns to the last. */
  strokes: number[];
  /** A drag stroke is in progress (desktop). */
  dragging: boolean;
  /** The draft may not be taken back below this while dragging. */
  floor: number;
  /** The hex the line could not reach, and why — painted red, explained in the panel. */
  blocked: { hex: Axial; reason: string } | null;
  setWidth: (w: PisteWidth) => void;
  setTarget: (t: RouteTarget) => void;
  setMode: (m: PisteMode) => void;
  setName: (n: string) => void;
  reset: () => void;
}

export const usePisteEditor = create<PisteEditorState>((set) => ({
  width: 2,
  target: "blue",
  mode: "draw",
  name: "",
  strokes: [],
  dragging: false,
  floor: 0,
  blocked: null,
  setWidth: (width) => set({ width }),
  setTarget: (target) => set({ target }),
  setMode: (mode) => set({ mode, blocked: null }),
  setName: (name) => set({ name: name.slice(0, 32) }),
  reset: () => set({ strokes: [], dragging: false, floor: 0, blocked: null, name: "" }),
}));

const key = (h: Axial) => `${h.q},${h.r}`;

/** Whether this kind of run is graded and joins stations (roads do neither). */
export function isSkiRun(itemId: string | null): boolean {
  return itemId === "piste" || itemId === "snowpark";
}

function check(path: readonly Axial[]): IntentResult {
  const g = useGame.getState();
  return validatePistePath(g, getDem(), g.buildItem ?? "piste", path);
}

function setDraft(draft: Axial[], prevLen: number | null, blocked: PisteEditorState["blocked"]) {
  const ed = usePisteEditor.getState();
  usePisteEditor.setState({
    strokes: prevLen === null ? ed.strokes : [...ed.strokes, prevLen],
    blocked,
  });
  useGame.setState({ pisteDraft: draft, lastStampAt: Date.now(), lastStampHex: draft[draft.length - 1] ?? null });
}

/**
 * Where a run tapped at `hex` begins: on a nearby lift top or run end when
 * there is one the ground allows, else right here. Null when here is
 * impossible too, with the reason.
 */
export function pisteStartAt(hex: Axial): { hex: Axial; snapped: boolean } | { error: string } {
  const g = useGame.getState();
  const itemId = g.buildItem ?? "piste";
  const dem = getDem();
  if (isSkiRun(itemId)) {
    const snap = snapPisteStart(g, dem, hex);
    if (snap && validateGround(dem, snap.hex.q, snap.hex.r, itemId).ok) return { hex: snap.hex, snapped: true };
  }
  const v = validateGround(dem, hex.q, hex.r, itemId);
  if (!v.ok) return { error: v.reason };
  return { hex, snapped: false };
}

function startDraft(hex: Axial): boolean {
  const start = pisteStartAt(hex);
  if ("error" in start) {
    play("error");
    useGame.getState().pushNote("Start unmöglich", start.error, "warn");
    return false;
  }
  setDraft([start.hex], 0, null);
  return true;
}

/** Hexes a suggested route should go around: buildings, and the draft itself. */
function routeAvoid(draft: readonly Axial[]): Set<string> {
  const g = useGame.getState();
  const stations = new Set(g.lifts.flatMap((l) => [l.stationA, l.stationB]));
  const out = new Set<string>();
  for (const b of g.buildings) if (!stations.has(b.id)) out.add(`${b.q},${b.r}`);
  for (const h of draft.slice(0, -1)) out.add(key(h));
  return out;
}

/** Route mode: from the end of the draft down to `end`, as one undoable step. */
function routeTo(end: Axial) {
  const g = useGame.getState();
  const ed = usePisteEditor.getState();
  const draft = g.pisteDraft;
  const from = draft[draft.length - 1]!;
  const room = MAX_PISTE_HEXES - draft.length + 1;
  if (room < 2) {
    g.pushNote("Zu lang", `Höchstens ${MAX_PISTE_HEXES - 1} Segmente am Stück. Tippe «Fertig».`, "warn");
    return;
  }
  const path = routePiste(getDem(), from, end, isSkiRun(g.buildItem) ? ed.target : "any", {
    itemId: g.buildItem ?? "piste",
    avoid: routeAvoid(draft),
    maxHexes: room,
  });
  if (!path) {
    play("error");
    usePisteEditor.setState({ blocked: { hex: end, reason: "Keine Route: Ziel tiefer und näher wählen" } });
    g.pushNote("Keine Route gefunden", "Das Ziel muss tiefer liegen und über befahrbaren Hang erreichbar sein.", "warn");
    return;
  }
  const candidate = [...draft, ...path.slice(1)];
  const v = check(candidate);
  if (!v.ok) {
    usePisteEditor.setState({ blocked: { hex: end, reason: v.reason } });
    g.pushNote("Nicht möglich", v.reason, "warn");
    return;
  }
  setDraft(candidate, draft.length, null);
}

/**
 * A tap or click while drawing a run.
 *
 * Draw mode: the first tap starts the run (snapped onto a lift top nearby),
 * every later one extends it along the hex line for as far as the run stays
 * valid. Route mode: the first tap is the start, every later one is a target
 * the route is suggested to.
 */
export function pisteClick(q: number, r: number) {
  const g = useGame.getState();
  if (!g.buildItem) return;
  const ed = usePisteEditor.getState();
  const hex = { q, r };
  if (g.pisteDraft.length === 0) {
    usePisteEditor.setState({ strokes: [] });
    startDraft(hex);
    return;
  }
  if (ed.mode === "route" && g.buildItem !== "road") {
    routeTo(hex);
    return;
  }
  const draft = g.pisteDraft;
  const step = extendDraft(draft, hex, draft.length, check);
  if (step.added > 0) {
    setDraft(step.draft, draft.length, step.blocked ? { hex: nextOf(step.draft, hex), reason: step.blocked.reason } : null);
    return;
  }
  if (step.blocked) {
    play("error");
    usePisteEditor.setState({ blocked: { hex: nextOf(draft, hex), reason: step.blocked.reason } });
    g.pushNote("Nicht möglich", step.blocked.reason, "warn");
  }
}

/** The hex the line toward `target` would have taken next. */
function nextOf(draft: readonly Axial[], target: Axial): Axial {
  const last = draft[draft.length - 1]!;
  const dq = target.q - last.q;
  const dr = target.r - last.r;
  const n = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  if (n === 0) return last;
  // First step of the hex line, rounded in cube space.
  const fq = last.q + dq / n;
  const fr = last.r + dr / n;
  const fs = -fq - fr;
  let rq = Math.round(fq);
  let rr = Math.round(fr);
  const rs = Math.round(fs);
  const eq = Math.abs(rq - fq);
  const er = Math.abs(rr - fr);
  const es = Math.abs(rs - fs);
  if (eq > er && eq > es) rq = -rr - rs;
  else if (er > es) rr = -rq - rs;
  return { q: rq, r: rr };
}

/** Desktop: the pointer went down on the ground while drawing. */
export function beginPisteStroke(q: number, r: number): boolean {
  const g = useGame.getState();
  const ed = usePisteEditor.getState();
  if (g.phase !== "piste" || !g.buildItem || ed.mode !== "draw") return false;
  const draft = g.pisteDraft;
  const before = draft.length;
  if (before === 0) {
    if (!startDraft({ q, r })) return false;
  } else {
    // The press itself extends the run, like a click.
    const step = extendDraft(draft, { q, r }, before, check);
    if (step.added > 0) useGame.setState({ pisteDraft: step.draft });
    usePisteEditor.setState({
      blocked: step.blocked ? { hex: nextOf(step.draft, { q, r }), reason: step.blocked.reason } : null,
    });
  }
  // The whole stroke, press included, is one step for "Zurück".
  usePisteEditor.setState({
    dragging: true,
    floor: Math.max(1, before),
    strokes: [...(before === 0 ? [] : ed.strokes), before],
  });
  return true;
}

/** Desktop: the pointer moved while a stroke is held. */
export function dragPisteTo(q: number, r: number) {
  const ed = usePisteEditor.getState();
  if (!ed.dragging) return;
  const g = useGame.getState();
  const draft = g.pisteDraft;
  const last = draft[draft.length - 1];
  if (last && last.q === q && last.r === r) return;
  const step = extendDraft(draft, { q, r }, ed.floor, check);
  if (step.added !== 0) {
    useGame.setState({ pisteDraft: step.draft });
  }
  usePisteEditor.setState({
    blocked: step.blocked ? { hex: nextOf(step.draft, { q, r }), reason: step.blocked.reason } : null,
  });
}

/** Desktop: the stroke ended. The draft stays open for more strokes. */
export function endPisteStroke() {
  const ed = usePisteEditor.getState();
  if (!ed.dragging) return;
  const len = useGame.getState().pisteDraft.length;
  const strokes = [...ed.strokes];
  // A press that added nothing is not a step to take back.
  if (strokes.length > 0 && strokes[strokes.length - 1]! >= len) strokes.pop();
  usePisteEditor.setState({ dragging: false, strokes });
}

/** "Zurück": take back the last stroke or segment. */
export function undoPisteStep() {
  const ed = usePisteEditor.getState();
  const draft = useGame.getState().pisteDraft;
  if (draft.length === 0) return;
  const strokes = ed.strokes.filter((n) => n < draft.length);
  const to = strokes.pop() ?? 0;
  usePisteEditor.setState({ strokes, blocked: null });
  useGame.setState({ pisteDraft: draft.slice(0, to) });
}

/** Why "Fertig" cannot be pressed yet, or null when it can. */
export function finishBlocker(draft: readonly Axial[], coins: number, width: PisteWidth): string | null {
  const g = useGame.getState();
  const itemId = g.buildItem;
  if (!itemId) return "Nichts gewählt";
  if (draft.length < 2) return "Mindestens zwei Felder";
  const v = validatePistePath(g, getDem(), itemId, draft);
  if (!v.ok) return v.reason;
  if (coins < discounted(g, pisteCost(getDem(), itemId, draft, itemId === "piste" ? width : undefined))) return "Zu teuer";
  return null;
}

/** "Fertig": send the run. The editor stays open for the next one. */
export function finishPisteDraft() {
  const g = useGame.getState();
  const ed = usePisteEditor.getState();
  const itemId = g.buildItem;
  if (!itemId || g.pisteDraft.length < 2) return;
  const blocker = finishBlocker(g.pisteDraft, spendable(g, g.playerId ?? undefined), ed.width);
  if (blocker) {
    play("error");
    g.pushNote("Noch nicht fertig", blocker, "warn");
    return;
  }
  const name = ed.name.trim();
  g.sendIntent({
    type: "place_piste",
    itemId,
    hexes: g.pisteDraft,
    ...(itemId === "piste" ? { width: ed.width } : {}),
    ...(name ? { name } : {}),
  });
  useGame.setState({ pisteDraft: [], phase: "piste" });
  usePisteEditor.getState().reset();
}

/** Label of a grade target, for the route picker. */
export const TARGET_LABEL: Record<RouteTarget, string> = {
  blue: "Blau",
  red: "Rot",
  black: "Schwarz",
  any: "Egal",
};

export const GRADE_COLOR: Record<PisteGrade, string> = {
  blue: "#2b7de9",
  red: "#d64545",
  black: "#1c1c1c",
};

/** Name of the item being drawn, for copy. */
export function draftItemName(): string {
  const id = useGame.getState().buildItem;
  return id ? BY_ID[id].name : "Piste";
}

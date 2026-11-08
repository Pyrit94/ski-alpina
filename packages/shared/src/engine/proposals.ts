import { TEAMPLAY } from "../../../config/src/economy.ts";
import { createId } from "../ids.ts";
import { IntentSchema, type Intent } from "../protocol/intents.ts";
import type { Dem } from "../terrain/dem.ts";
import type { IntentResult, PlayerRole, Proposal, ResortState } from "../types.ts";
import { applyIntent } from "./apply.ts";
import type { ResearchContext } from "./research.ts";
import { validateIntent } from "./validate.ts";

/**
 * Proposals: a big step one player wants and the other confirms.
 *
 * The proposal carries ordinary intents. Accepting applies them one after the
 * other as the proposer's own, checked again against the valley as it is
 * then; if one no longer fits, nothing more of it happens and the rest is
 * dropped with a note.
 */
type Actor = { id: string; name: string };

/** Intents a proposal may carry: anything that is not itself about proposals. */
const NOT_NESTED = new Set(["propose", "decide_proposal", "set_proposal_limit"]);

export function proposalLimit(state: Pick<ResortState, "proposalLimit">): number {
  return state.proposalLimit ?? TEAMPLAY.proposalLimit;
}

/** The carried intents, parsed; null when one of them is not a valid intent. */
export function parseCarried(raw: readonly unknown[]): Intent[] | null {
  const out: Intent[] = [];
  for (const r of raw) {
    const parsed = IntentSchema.safeParse(r);
    if (!parsed.success || NOT_NESTED.has(parsed.data.type)) return null;
    out.push(parsed.data);
  }
  return out;
}

/**
 * Apply intents in order, each checked against the state the one before
 * left. Returns how far it got.
 */
export function runIntents(
  state: ResortState,
  dem: Dem,
  intents: readonly Intent[],
  now: number,
  actor: Actor,
  ctx: ResearchContext = {},
): { state: ResortState; applied: number; failed: string | null } {
  let s = state;
  let applied = 0;
  for (const intent of intents) {
    const v = validateIntent(s, dem, intent, "builder", now, { ...ctx, actorId: actor.id });
    if (!v.ok) return { state: s, applied, failed: v.reason };
    s = applyIntent(s, intent, now, actor, dem, ctx.team).state;
    applied++;
  }
  return { state: s, applied, failed: null };
}

/** What a set of intents would cost the proposer, by trying them. */
export function costOf(state: ResortState, dem: Dem, intents: readonly Intent[], now: number, actor: Actor): number {
  const tried = runIntents(state, dem, intents, now, actor);
  return Math.max(0, state.coins - tried.state.coins);
}

export function validateProposalIntent(
  state: ResortState,
  dem: Dem,
  intent: Extract<Intent, { type: "propose" | "decide_proposal" | "set_proposal_limit" }>,
  role: PlayerRole,
  now: number,
  ctx: ResearchContext,
): IntentResult {
  if (role !== "builder") return { ok: false, code: "rights", reason: "Keine Baurechte" };
  if (intent.type === "set_proposal_limit") return { ok: true };
  if (intent.type === "propose") {
    if ((state.proposals ?? []).length >= TEAMPLAY.maxOpenProposals) {
      return { ok: false, code: "invalid", reason: "Schon viele offene Vorschläge – erst entscheiden" };
    }
    const carried = parseCarried(intent.intents);
    if (!carried) return { ok: false, code: "invalid", reason: "Vorschlag enthält Unbekanntes" };
    if (!ctx.actorId) return { ok: false, code: "rights", reason: "Nicht verbunden" };
    const tried = runIntents(state, dem, carried, now, { id: ctx.actorId, name: "" }, ctx);
    return tried.failed ? { ok: false, code: "invalid", reason: tried.failed } : { ok: true };
  }
  const p = (state.proposals ?? []).find((x) => x.id === intent.proposalId);
  if (!p) return { ok: false, code: "invalid", reason: "Vorschlag gibt es nicht mehr" };
  if (intent.accept && p.by === ctx.actorId) {
    return { ok: false, code: "rights", reason: "Den eigenen Vorschlag bestätigt die andere Person" };
  }
  return { ok: true };
}

export function applyProposalIntent(
  state: ResortState,
  dem: Dem | undefined,
  intent: Extract<Intent, { type: "propose" | "decide_proposal" | "set_proposal_limit" }>,
  now: number,
  actor: Actor | undefined,
  team?: readonly string[],
): { state: ResortState; title: string; body: string; kind: "ok" | "info" | "warn" } {
  if (intent.type === "set_proposal_limit") {
    return {
      state: { ...state, proposalLimit: intent.limit },
      title: "Vorschläge",
      body: intent.limit > 0 ? `Ab ${intent.limit.toLocaleString("de-CH")} fragt das Spiel die andere Person.` : "Alles wird direkt gebaut.",
      kind: "info",
    };
  }
  const proposals = state.proposals ?? [];
  if (intent.type === "propose") {
    const carried = parseCarried(intent.intents) ?? [];
    const by = actor ?? { id: "", name: "Jemand" };
    const proposal: Proposal = {
      id: createId("pr"),
      by: by.id,
      byName: by.name,
      at: now,
      title: intent.title,
      intents: carried,
      cost: dem ? costOf(state, dem, carried, now, by) : 0,
    };
    return {
      state: { ...state, proposals: [...proposals, proposal] },
      title: "Neuer Vorschlag",
      body: `${by.name}: ${intent.title}`,
      kind: "info",
    };
  }
  const p = proposals.find((x) => x.id === intent.proposalId)!;
  const rest = proposals.filter((x) => x.id !== p.id);
  if (!intent.accept) {
    const own = actor?.id === p.by;
    return {
      state: { ...state, proposals: rest },
      title: own ? "Vorschlag zurückgezogen" : "Vorschlag abgelehnt",
      body: p.title,
      kind: "info",
    };
  }
  if (!dem) return { state: { ...state, proposals: rest }, title: "Vorschlag", body: "Kein Gelände geladen.", kind: "warn" };
  const ran = runIntents({ ...state, proposals: rest }, dem, p.intents, now, { id: p.by, name: p.byName }, { team });
  return {
    state: ran.state,
    title: ran.failed ? "Vorschlag nur zum Teil umgesetzt" : "Vorschlag angenommen",
    body: ran.failed ? `${p.title}: ${ran.applied} von ${p.intents.length} umgesetzt. ${ran.failed}.` : p.title,
    kind: ran.failed ? "warn" : "ok",
  };
}

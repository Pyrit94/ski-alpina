// Explicit extensions so the node test runner can load this directly.
import { TEAMPLAY } from "../../../packages/config/src/economy.ts";
import { BY_ID } from "../../../packages/config/src/items.ts";
import type { Dem } from "../../../packages/shared/src/terrain/dem.ts";
import type { Intent } from "../../../packages/shared/src/protocol/intents.ts";
import type { ResortState } from "../../../packages/shared/src/types.ts";
import { costOf, proposalLimit } from "../../../packages/shared/src/engine/proposals.ts";

/** Intents that spend money on the valley: the ones a proposal is for. */
const COSTLY = new Set<Intent["type"]>([
  "place_building",
  "place_lift",
  "place_piste",
  "edit_piste",
  "upgrade",
  "expand",
  "move_building",
  "rearrange",
  "reshape_piste",
]);

type View = Pick<ResortState, "contributors" | "match" | "proposalLimit"> & ResortState;

/** The other people who build here: who has built before, and who is online now. */
export function partners(state: View, me: string | null, online: readonly { id: string; name: string }[] = []): string[] {
  const names = new Map<string, string>();
  for (const [id, c] of Object.entries(state.contributors ?? {})) if (id && id !== me) names.set(id, c.name);
  for (const p of online) if (p.id !== me) names.set(p.id, p.name);
  return [...names.values()];
}

/** A title for what the intents do, as the other player reads it. */
export function planTitle(intents: readonly Intent[]): string {
  const first = intents[0]!;
  if (first.type === "rearrange") return `Dorf neu ordnen (${first.moves.length} Gebäude)`;
  const pistes = intents.filter((i) => i.type === "place_piste").length;
  if (pistes > 1) return `${pistes} Pisten anlegen`;
  if (first.type === "place_building" || first.type === "place_lift") {
    const same = intents.filter((i) => (i.type === "place_building" || i.type === "place_lift") && i.itemId === first.itemId).length;
    if (same === intents.length && same > 1) return `${same}× ${BY_ID[first.itemId].name} bauen`;
    if (intents.length > 1) return `${BY_ID[first.itemId].name} und ${intents.length - 1} weitere bauen`;
    return `${BY_ID[first.itemId].name} bauen`;
  }
  if (first.type === "place_piste") return "Neue Piste anlegen";
  if (first.type === "expand") return "Ausbauen";
  if (first.type === "upgrade") return "Bahn verbessern";
  if (first.type === "move_building") return "Gebäude verschieben";
  if (first.type === "edit_piste") return "Piste ändern";
  return "Bauen";
}

/**
 * Whether these intents should go to the other player first: only with
 * someone else in the game, not in a duel (separate resorts), and then for
 * the village optimiser always and otherwise above the cost limit.
 */
export function proposalFor(
  state: View,
  dem: Dem,
  intents: readonly Intent[],
  me: { id: string; name: string } | null,
  online: readonly { id: string; name: string }[] = [],
  title?: string,
): Extract<Intent, { type: "propose" }> | null {
  if (!me || intents.length === 0 || intents.length > TEAMPLAY.maxProposalIntents) return null;
  if (!intents.every((i) => COSTLY.has(i.type))) return null;
  if (partners(state, me.id, online).length === 0) return null;
  if (state.match?.mode === "match" && state.match.options?.economy === "duel") return null;
  const limit = proposalLimit(state);
  if (limit <= 0) return null;
  const always = intents.some((i) => i.type === "rearrange");
  if (!always && costOf(state, dem, intents, Date.now(), me) <= limit) return null;
  return { type: "propose", title: title ?? planTitle(intents), intents: intents as unknown as Record<string, unknown>[] };
}

// Explicit extensions so the node test runner can load this directly.
import { ECONOMY } from "../../../packages/config/src/economy.ts";
import { BY_ID } from "../../../packages/config/src/items.ts";
import type { ItemId } from "../../../packages/config/src/ids.ts";
import { capacityFactor } from "../../../packages/shared/src/engine/state.ts";
import type { PlacedBuilding, SimStats } from "../../../packages/shared/src/types.ts";

/**
 * What the resort is short of, the way a guest would notice it: a seat at
 * lunch, a shop, a bed, a way in, a short queue. Each need is a share between
 * 0 (nothing there) and 1 (covered), with the building that would help.
 */
export type NeedKey = "food" | "shops" | "beds" | "access" | "lifts";

export interface Need {
  key: NeedKey;
  label: string;
  /** 0 … 1: how much of it is covered. */
  covered: number;
  /** One line on why, in numbers. */
  detail: string;
  /** What to build for it; null when nothing that fits is unlocked. */
  itemId: ItemId | null;
}

export interface NeedsInput {
  stats: SimStats;
  buildings: readonly PlacedBuilding[];
  unlocked: (itemId: ItemId) => boolean;
  coins: number;
  /** Location factors by building id (see SITE); 1 where missing. */
  site?: ReadonlyMap<string, number>;
}

/** Below this a need is worth pointing at. */
export const NEED_SHORT = 0.85;

const CANDIDATES: Record<NeedKey, ItemId[]> = {
  food: ["restaurant", "gastro-hall"],
  shops: ["shop"],
  beds: ["hotel1", "hotel3", "hotel5", "hotel-resort"],
  access: ["parking", "bus", "train"],
  lifts: ["chair", "gondola", "funitel"],
};

/** How much one building of a kind covers, in the need's own unit. */
function sizeOf(itemId: ItemId): number {
  const item = BY_ID[itemId];
  if (itemId === "parking") return ECONOMY.parkingArrivalsPerHour;
  if (itemId === "bus") return ECONOMY.busArrivalsPerHour;
  if (itemId === "train") return ECONOMY.trainArrivalsPerHour;
  return item.seatsPerHour ?? item.retailPerHour ?? item.beds ?? item.capacity ?? 0;
}

/** The cheapest unlocked building that closes the gap; else the biggest one there is money for; else the cheapest. */
function pick(key: NeedKey, gap: number, unlocked: NeedsInput["unlocked"], coins: number): ItemId | null {
  const open = CANDIDATES[key].filter(unlocked).sort((a, b) => BY_ID[a].cost - BY_ID[b].cost);
  if (open.length === 0) return null;
  const affordable = open.filter((id) => BY_ID[id].cost <= coins);
  return (
    affordable.find((id) => sizeOf(id) >= gap) ??
    affordable.sort((a, b) => sizeOf(b) - sizeOf(a))[0] ??
    open[0]!
  );
}

const share = (have: number, want: number) => (want <= 0 ? 1 : Math.max(0, Math.min(1, have / want)));
const round = (n: number) => Math.round(n).toLocaleString("de-CH");

export function computeNeeds(input: NeedsInput): Need[] {
  const { stats, buildings, unlocked, coins } = input;
  const at = (b: PlacedBuilding) => input.site?.get(b.id) ?? 1;
  const total = (field: "seatsPerHour" | "retailPerHour") =>
    buildings.reduce((n, b) => n + (BY_ID[b.itemId]?.[field] ?? 0) * capacityFactor(b) * at(b), 0);
  const guests = stats.guestsPerHour;
  const seats = total("seatsPerHour");
  const retail = total("retailPerHour");
  const overnight = (stats.marketPerHour / ECONOMY.ridesPerGuest) * ECONOMY.overnightShare;
  const market = stats.marketPerHour;
  const queue = Math.max(0, Math.min(1, (stats.waitMinutes - 4) / 16));

  return [
    {
      key: "food",
      label: "Essen",
      covered: share(seats, guests),
      detail: `${round(seats)} Plätze für ${round(guests)} Gäste pro Stunde`,
      itemId: pick("food", guests - seats, unlocked, coins),
    },
    {
      key: "shops",
      label: "Läden",
      covered: share(retail, guests),
      detail: `${round(retail)} Kunden pro Stunde möglich, ${round(guests)} Gäste da`,
      itemId: pick("shops", guests - retail, unlocked, coins),
    },
    {
      key: "beds",
      label: "Betten",
      covered: share(stats.beds, overnight),
      detail: `${round(stats.beds)} Betten, gefragt sind etwa ${round(overnight)}`,
      itemId: pick("beds", overnight - stats.beds, unlocked, coins),
    },
    {
      key: "access",
      label: "Anreise",
      covered: market > 0 ? 1 - Math.min(1, stats.turnedAway / market) : 1,
      detail:
        stats.turnedAway > 0
          ? `${round(stats.turnedAway)} Gäste pro Stunde finden keinen Platz im Tal`
          : "Alle Gäste kommen ins Tal",
      itemId: pick("access", stats.turnedAway, unlocked, coins),
    },
    {
      key: "lifts",
      label: "Lifte",
      covered: 1 - queue,
      detail: `${stats.waitMinutes} Minuten Wartezeit`,
      itemId: pick("lifts", 0, unlocked, coins),
    },
  ];
}

/** The need that is shortest right now, if any is short at all. */
export function worstNeed(needs: readonly Need[]): Need | null {
  let worst: Need | null = null;
  for (const n of needs) if (n.covered < NEED_SHORT && n.itemId && (!worst || n.covered < worst.covered)) worst = n;
  return worst;
}

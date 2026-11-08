import { Bus, Cable, Hammer, Hotel, Mountain, Shovel, Store, TrainFront, Trees, Utensils } from "lucide-react";
import { ECONOMY } from "@/lib/game/catalog";
import { fmt } from "@/lib/game/format";
import { useGame } from "@/lib/game/store";
import type { Category, HudSheet, ItemId } from "@/lib/game/types";

/** Minutes-ago, in the shortest form that is still honest. */
export function sinceLabel(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "gerade";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`;
}

/** Category names that fit under a round button on a phone. */
export const SHORT_CAT: Partial<Record<Category, string>> = { lifts: "Bahnen", deco: "Deko" };

export const CAT_ICON: Record<Category, typeof Cable> = {
  lifts: Cable,
  buildings: Hotel,
  pistes: Mountain,
  deco: Trees,
  services: Store,
};

/**
 * The price to show in a list.
 *
 * A piste no longer has one price: gentle ground is cheap to cut and steep
 * ground is not, so the catalogue figure is a floor rather than a quote. The
 * real number appears while drawing, in the piste editor.
 */
export function priceLabel(item: { id: ItemId; cost: number }): string {
  return item.id === "piste" ? `ab ${fmt(item.cost)}` : fmt(item.cost);
}

export const ITEM_ICON: Partial<Record<ItemId, typeof Cable>> = {
  gondola: Cable,
  chair: Cable,
  tbar: Cable,
  tram: Cable,
  restaurant: Utensils,
  hut: Hotel,
  hotel1: Hotel,
  hotel3: Hotel,
  hotel5: Hotel,
  shop: Store,
  parking: Bus,
  groomer: Hammer,
  viewpoint: Mountain,
  train: TrainFront,
  cog: TrainFront,
  level: Shovel,
};

/** Below this share of its capacity a lift reads as nearly empty. */
export const LOW_USE = 0.25;

/** What a demolition pays back, mirroring the server's share of the build price. */
export function refundFor(cost: number) {
  return Math.floor(cost * ECONOMY.demolishRefund);
}

export function toggleSheet(current: HudSheet, next: HudSheet) {
  useGame.getState().setSheet(current === next ? "none" : next);
}

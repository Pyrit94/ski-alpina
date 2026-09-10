export const ITEM_IDS = [
  "tbar",
  "chair",
  "gondola",
  "tram",
  "restaurant",
  "hut",
  "hotel1",
  "hotel3",
  "hotel5",
  "shop",
  "skischool",
  "ticket",
  "apres",
  "spa",
  "piste-blue",
  "piste-red",
  "piste-black",
  "snowpark",
  "road",
  "tree",
  "rock",
  "viewpoint",
  "lights",
  "snowmaker",
  "groomer",
  "workshop",
  "parking",
  "clinic",
  "bus",
  // Level 9 and up. The level curve runs to 40 but nothing unlocked past 8,
  // so progression simply stopped there.
  "funitel",
  "glacier",
  "hotel-resort",
  "gastro-hall",
  "depot",
  "cablecar-museum",
] as const;

export type ItemId = (typeof ITEM_IDS)[number];

export const CATEGORY_IDS = ["lifts", "buildings", "pistes", "deco", "services"] as const;
export type Category = (typeof CATEGORY_IDS)[number];

export const LIFT_IDS: readonly ItemId[] = ["tbar", "chair", "gondola", "tram", "funitel", "glacier"];
export const PISTE_IDS: readonly ItemId[] = ["piste-blue", "piste-red", "piste-black", "snowpark", "road"];
export const HOTEL_IDS: readonly ItemId[] = ["hotel1", "hotel3", "hotel5", "hotel-resort"];

export function isLift(id: ItemId): boolean {
  return (LIFT_IDS as readonly string[]).includes(id);
}

export function isPiste(id: ItemId): boolean {
  return (PISTE_IDS as readonly string[]).includes(id);
}

export function isHotel(id: ItemId): boolean {
  return (HOTEL_IDS as readonly string[]).includes(id);
}

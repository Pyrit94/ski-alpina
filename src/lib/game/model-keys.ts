/**
 * Which file in public/models a thing on the map is drawn from, and what it
 * falls back to. Pure, with no imports, so the node test runner loads it
 * directly (model-keys.test.ts) and scripts/import-models.mjs can mirror it.
 *
 * Besides the catalogue's item ids (buildings, levels `name-2..4`), these
 * are the slots a model can fill. A slot without a file keeps the built-in
 * look; a more specific slot falls back to a more general one first.
 */

export const LIFT_TYPES = ["tbar", "chair", "gondola", "tram", "funitel", "glacier", "cog"] as const;

export const HOUSE_KEYS = ["house-1", "house-2", "house-3", "house-4", "house-5", "house-6"] as const;
export const TREE_KEYS = ["tree-spruce", "tree-larch"] as const;
export const PROP_KEYS = ["bench", "parasol", "flag", "sign"] as const;
export type PropKey = (typeof PROP_KEYS)[number];

/** Every slot besides the item ids, with what the Werkbank calls it. */
export const PART_LABEL: Record<string, string> = {
  station: "Liftstation (alle Bahnen)",
  "station-mid": "Mittelstation",
  "station-tbar": "Station Skilift",
  "station-chair": "Station Sesselbahn",
  "station-gondola": "Station Gondelbahn",
  "station-tram": "Station Pendelbahn",
  "station-funitel": "Station Funitel",
  "station-glacier": "Station Gletscherbahn",
  "station-cog": "Station Zahnradbahn",
  pylon: "Liftmast",
  "carrier-chair": "Sessel",
  "carrier-cabin": "Gondelkabine",
  "carrier-tram": "Pendelbahn-Kabine",
  "carrier-tbar": "Schleppbügel",
  "carrier-train": "Zahnradbahn-Wagen",
  "house-1": "Dorfhaus 1",
  "house-2": "Dorfhaus 2",
  "house-3": "Dorfhaus 3",
  "house-4": "Dorfhaus 4",
  "house-5": "Dorfhaus 5",
  "house-6": "Dorfhaus 6",
  church: "Dorfkirche",
  "tree-spruce": "Fichte",
  "tree-larch": "Lärche",
  skier: "Skifahrer",
  snowboarder: "Snowboarder",
  car: "Auto",
  coach: "Reisebus",
  "groomer-vehicle": "Pistenfahrzeug",
  bench: "Bank",
  parasol: "Sonnenschirm",
  flag: "Fahne",
  sign: "Pistenschild",
};

/** Slot names that end in a number or a word and are never a level suffix. */
export const WHOLE_KEYS: readonly string[] = Object.keys(PART_LABEL);

export type ModelSlot = "station" | "station-mid" | "carrier";

/**
 * The files to try for a slot, most specific first.
 *
 *   station      → station-<lift>, station
 *   station-mid  → station-mid, station-<lift>, station
 *   carrier      → carrier-tram, carrier-cabin (tram); carrier-train (cog);
 *                  carrier-chair, carrier-tbar; carrier-cabin (the rest)
 */
export function modelKeysFor(slot: ModelSlot, itemId: string): string[] {
  if (slot === "station") return [`station-${itemId}`, "station"];
  if (slot === "station-mid") return ["station-mid", `station-${itemId}`, "station"];
  if (itemId === "tram") return ["carrier-tram", "carrier-cabin"];
  if (itemId === "cog") return ["carrier-train"];
  if (itemId === "chair" || itemId === "tbar") return [`carrier-${itemId}`];
  return ["carrier-cabin"];
}

/** The first file of the chain that is there, or null for the built-in model. */
export function modelKeyFor(slot: ModelSlot, itemId: string, has: (key: string) => boolean): string | null {
  return modelKeysFor(slot, itemId).find(has) ?? null;
}

/** A stable small hash, so a house keeps its variant from load to load. */
export function hashIndex(seed: number, n: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return n > 0 ? (h >>> 0) % n : 0;
}

/**
 * Which house model a village house is drawn with: one of the house files
 * that are there, the same one every time for the same house. Null when
 * there is none, so the built-in chalet stays.
 */
export function houseVariant(index: number, available: readonly string[]): string | null {
  if (available.length === 0) return null;
  return available[hashIndex(index + 1, available.length)]!;
}

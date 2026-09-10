import type { Category, ItemId } from "./ids.ts";

export interface CatalogItem {
  id: ItemId;
  category: Category;
  name: string;
  blurb: string;
  cost: number;
  gemCost?: number;
  xp: number;
  unlockLevel: number;
  buildSeconds: number;
  footprint: number;
  maxSlope: number;
  minElev: number;
  maxElev: number;
  /** People per hour this edge carries: lift throughput, or piste/road width. */
  capacity?: number;
  beds?: number;
  /**
   * Share of `capacity` usable for the descent. Cabins come back down anyway,
   * so a gondola is also a way off the mountain; a T-bar is not.
   *
   * Keep this small. It stands for the guests who ride down rather than ski —
   * sightseers, beginners, the end of the day. Set it high and a single
   * gondola carries the whole resort, which makes every piste pointless.
   */
  downhillShare?: number;
  /**
   * Running cost per operating day, in the same unit as income.
   *
   * Deliberately a drag rather than a death sentence: there is no way to
   * demolish anything yet, so upkeep a player cannot escape would brick a save
   * instead of teaching them to build tighter. Pistes pay this per segment.
   */
  upkeep?: number;
  /** Guests per hour this building can feed. */
  seatsPerHour?: number;
  /** Guests per hour this building can sell to. */
  retailPerHour?: number;
  /** Share of cableway upkeep it removes. Only the best one on site applies. */
  upkeepCut?: number;
  /** Satisfaction points it adds, once per copy built. */
  satisfactionBonus?: number;
  /** Extra share of winter demand it draws once the mountain is green. */
  summerDraw?: number;
  speed?: number;
  minSpan?: number;
  maxSpan?: number;
  color: string;
}

export const CATALOG: CatalogItem[] = [
  { id: "tbar", category: "lifts", name: "Schlepplift", blurb: "Guenstig, fuer Anfaengerhaenge. Bis 800 Pers./h.", cost: 4500, xp: 18, unlockLevel: 1, buildSeconds: 6, footprint: 1, maxSlope: 0.55, minElev: 1560, maxElev: 2800, capacity: 800, speed: 3.2, minSpan: 4, maxSpan: 14, upkeep: 110, color: "#3d6ea8" },
  { id: "chair", category: "lifts", name: "Sessellift", blurb: "Komfortabler 4er-Sessel. Bis 1.800 Pers./h.", cost: 18500, xp: 36, unlockLevel: 2, buildSeconds: 10, footprint: 1, maxSlope: 0.7, minElev: 1560, maxElev: 3400, capacity: 1800, speed: 4.2, minSpan: 6, maxSpan: 20, upkeep: 460, color: "#2F6FED" },
  { id: "gondola", category: "lifts", name: "Gondelbahn", blurb: "2.400 Pers./h. Faehrt auch talwaerts - Anschluss ins Dorf.", cost: 45000, xp: 70, unlockLevel: 3, buildSeconds: 14, footprint: 1, maxSlope: 1.1, minElev: 1560, maxElev: 3900, capacity: 2400, downhillShare: 0.12, speed: 6, minSpan: 8, maxSpan: 28, upkeep: 1100, color: "#1557b0" },
  { id: "tram", category: "lifts", name: "Pendelbahn", blurb: "Steile Waende, grosse Kabinen. 900 Pers./h, auch talwaerts.", cost: 82000, gemCost: 40, xp: 110, unlockLevel: 6, buildSeconds: 18, footprint: 1, maxSlope: 1.6, minElev: 1560, maxElev: 4500, capacity: 900, downhillShare: 0.15, speed: 8, minSpan: 10, maxSpan: 32, upkeep: 2000, color: "#16305C" },
  { id: "restaurant", category: "buildings", name: "Restaurant", blurb: "Sonnenterrasse. Skifahrer geben hier Geld aus.", cost: 12000, xp: 24, unlockLevel: 1, buildSeconds: 8, footprint: 1, maxSlope: 0.32, minElev: 1560, maxElev: 3200, upkeep: 260, seatsPerHour: 420, satisfactionBonus: 1.4, color: "#8b4a2b" },
  { id: "hut", category: "buildings", name: "Berghuette", blurb: "Klassische Walliser Huette mit Gluehwein.", cost: 8000, xp: 16, unlockLevel: 2, buildSeconds: 7, footprint: 1, maxSlope: 0.4, minElev: 1800, maxElev: 3400, upkeep: 170, seatsPerHour: 420, satisfactionBonus: 1.4, color: "#6b3f24" },
  { id: "hotel1", category: "buildings", name: "Hotel ★", blurb: "60 Betten. Gaeste bleiben ueber Nacht.", cost: 28000, xp: 40, unlockLevel: 3, buildSeconds: 14, footprint: 1, maxSlope: 0.22, minElev: 1580, maxElev: 2100, beds: 60, upkeep: 620, color: "#9a6a45" },
  { id: "hotel3", category: "buildings", name: "Hotel ★★★", blurb: "140 Betten, Halbpension, hoehere Raten.", cost: 64000, xp: 80, unlockLevel: 5, buildSeconds: 18, footprint: 1, maxSlope: 0.2, minElev: 1580, maxElev: 2050, beds: 140, upkeep: 1400, color: "#7a4a32" },
  { id: "hotel5", category: "buildings", name: "Palace ★★★★★", blurb: "240 Betten. Luxus, Spa, enorme Einnahmen.", cost: 140000, gemCost: 80, xp: 150, unlockLevel: 8, buildSeconds: 24, footprint: 1, maxSlope: 0.18, minElev: 1580, maxElev: 2000, beds: 240, upkeep: 3000, color: "#3d2a22" },
  { id: "shop", category: "buildings", name: "Sportshop", blurb: "Ski, Helm, Souvenirs. Bonus auf Zufriedenheit.", cost: 9500, xp: 18, unlockLevel: 2, buildSeconds: 7, footprint: 1, maxSlope: 0.28, minElev: 1580, maxElev: 2400, upkeep: 200, retailPerHour: 600, satisfactionBonus: 1.1, color: "#2f6f8f" },
  { id: "skischool", category: "buildings", name: "Skischule", blurb: "Mehr Anfaenger, hoehere Auslastung blauer Pisten.", cost: 16000, xp: 28, unlockLevel: 4, buildSeconds: 10, footprint: 1, maxSlope: 0.3, minElev: 1580, maxElev: 2300, upkeep: 340, color: "#c45c2a" },
  { id: "ticket", category: "buildings", name: "Kasse", blurb: "Talstation-Tickets. +8 % Einnahmen im Umkreis.", cost: 6000, xp: 12, unlockLevel: 1, buildSeconds: 5, footprint: 1, maxSlope: 0.25, minElev: 1580, maxElev: 2000, upkeep: 130, satisfactionBonus: 0.8, color: "#2F6FED" },
  { id: "apres", category: "buildings", name: "Apres-Ski", blurb: "Huette mit Musik. Abends extra Umsatz.", cost: 18000, xp: 30, unlockLevel: 4, buildSeconds: 9, footprint: 1, maxSlope: 0.28, minElev: 1580, maxElev: 2400, upkeep: 380, seatsPerHour: 420, satisfactionBonus: 1.4, color: "#b03a3a" },
  { id: "spa", category: "buildings", name: "Berg-Spa", blurb: "Wellness nach der Abfahrt. Luxusbonus.", cost: 42000, xp: 55, unlockLevel: 7, buildSeconds: 14, footprint: 1, maxSlope: 0.2, minElev: 1580, maxElev: 2600, upkeep: 900, satisfactionBonus: 6, summerDraw: 0.08, color: "#3d8a8a" },
  { id: "piste-blue", category: "pistes", name: "Blaue Piste", blurb: "Leicht. Breite Abfahrt fuer Familien.", cost: 700, xp: 6, unlockLevel: 1, buildSeconds: 3, footprint: 1, maxSlope: 0.42, minElev: 1560, maxElev: 3200, capacity: 1500, upkeep: 18, color: "#2b7de9" },
  { id: "piste-red", category: "pistes", name: "Rote Piste", blurb: "Mittel. Mehr Tempo, mehr Nervenkitzel.", cost: 1100, xp: 9, unlockLevel: 2, buildSeconds: 3, footprint: 1, maxSlope: 0.7, minElev: 1700, maxElev: 3600, capacity: 1100, upkeep: 28, color: "#d64545" },
  { id: "piste-black", category: "pistes", name: "Schwarze Piste", blurb: "Schwer. Steil, Prestige, Experten.", cost: 1700, xp: 14, unlockLevel: 4, buildSeconds: 4, footprint: 1, maxSlope: 1.15, minElev: 1900, maxElev: 4000, capacity: 700, upkeep: 42, color: "#1c1c1c" },
  { id: "snowpark", category: "pistes", name: "Snowpark", blurb: "Kicker & Rails. Zieht junge Gaeste an.", cost: 22000, xp: 34, unlockLevel: 5, buildSeconds: 10, footprint: 1, maxSlope: 0.38, minElev: 1800, maxElev: 3000, capacity: 900, upkeep: 480, color: "#F4B942" },
  { id: "road", category: "pistes", name: "Zufahrt", blurb: "Verbindet Dorf, Parken und Talstationen. Kein Skiweg.", cost: 400, xp: 3, unlockLevel: 1, buildSeconds: 2, footprint: 1, maxSlope: 0.28, minElev: 1560, maxElev: 2000, capacity: 2600, upkeep: 8, color: "#5a6570" },
  { id: "tree", category: "deco", name: "Arve", blurb: "Schoener Wald. Kleiner Zufriedenheitsbonus.", cost: 180, xp: 1, unlockLevel: 1, buildSeconds: 1, footprint: 1, maxSlope: 0.5, minElev: 1600, maxElev: 2500, upkeep: 0, satisfactionBonus: 0.15, color: "#1f3d2a" },
  { id: "rock", category: "deco", name: "Fels", blurb: "Natuerliche Kulisse.", cost: 120, xp: 1, unlockLevel: 1, buildSeconds: 1, footprint: 1, maxSlope: 1.4, minElev: 1700, maxElev: 4300, upkeep: 0, color: "#6a6764" },
  { id: "viewpoint", category: "deco", name: "Aussichtspunkt", blurb: "Fotospot. Gaeste lieben Gipfelblicke.", cost: 3500, xp: 10, unlockLevel: 3, buildSeconds: 5, footprint: 1, maxSlope: 0.35, minElev: 2200, maxElev: 3900, upkeep: 40, satisfactionBonus: 1.5, summerDraw: 0.06, color: "#4aa3c7" },
  { id: "lights", category: "deco", name: "Flutlicht", blurb: "Nachtpisten. Verlaengert den Betriebstag.", cost: 9000, xp: 16, unlockLevel: 5, buildSeconds: 6, footprint: 1, maxSlope: 0.5, minElev: 1700, maxElev: 3200, upkeep: 260, color: "#f4e27a" },
  { id: "snowmaker", category: "services", name: "Beschneiung", blurb: "Drueckt die Schneegrenze und haelt tiefe Abfahrten laenger offen.", cost: 20000, xp: 32, unlockLevel: 3, buildSeconds: 8, footprint: 1, maxSlope: 0.5, minElev: 1560, maxElev: 3200, upkeep: 520, color: "#7ec8ff" },
  { id: "groomer", category: "services", name: "Pistenraupe", blurb: "Depot. Gepflegte Pisten, weniger Stau.", cost: 14000, xp: 22, unlockLevel: 2, buildSeconds: 8, footprint: 1, maxSlope: 0.3, minElev: 1580, maxElev: 2400, upkeep: 420, color: "#d9890f" },
  { id: "workshop", category: "services", name: "Werkstatt", blurb: "Senkt Unterhalt der Bahnen.", cost: 11000, xp: 18, unlockLevel: 3, buildSeconds: 8, footprint: 1, maxSlope: 0.28, minElev: 1580, maxElev: 2200, upkeep: 240, upkeepCut: 0.15, color: "#6d6d6d" },
  { id: "parking", category: "services", name: "Parkhaus", blurb: "Tagesgaeste brauchen Parkplaetze.", cost: 8000, xp: 14, unlockLevel: 1, buildSeconds: 6, footprint: 1, maxSlope: 0.18, minElev: 1560, maxElev: 1850, upkeep: 170, color: "#4a5560" },
  { id: "clinic", category: "services", name: "Bergrettung", blurb: "Sicherheit. Bonus auf schwarze Pisten.", cost: 17000, xp: 26, unlockLevel: 4, buildSeconds: 9, footprint: 1, maxSlope: 0.32, minElev: 1600, maxElev: 3000, upkeep: 380, color: "#d23b3b" },
  { id: "bus", category: "services", name: "Busbahnhof", blurb: "OeV-Anschluss. Weniger Verkehrsstau.", cost: 12500, xp: 20, unlockLevel: 2, buildSeconds: 8, footprint: 1, maxSlope: 0.2, minElev: 1560, maxElev: 1850, upkeep: 270, color: "#1f7a4d" },

  // Level 9 and up. The XP curve runs to level 40 but the catalogue stopped
  // unlocking at 8, so there was nothing left to work towards. Each of these
  // answers a problem the flow graph creates at scale: not enough throughput
  // on the main artery, no snow-sure terrain in the thaw, not enough beds or
  // seats to serve a full mountain.
  { id: "funitel", category: "lifts", name: "Funitel", blurb: "Sturmsicher, 3.600 Pers./h. Die Hauptachse eines grossen Gebiets.", cost: 165000, gemCost: 60, xp: 190, unlockLevel: 9, buildSeconds: 26, footprint: 1, maxSlope: 1.2, minElev: 1560, maxElev: 3600, capacity: 3600, downhillShare: 0.14, upkeep: 3900, speed: 7, minSpan: 10, maxSpan: 30, color: "#0f3f8f" },
  { id: "glacier", category: "lifts", name: "Gletscherbahn", blurb: "Bis auf den Gletscher - schneesicher, wenn unten alles taut.", cost: 260000, gemCost: 120, xp: 260, unlockLevel: 12, buildSeconds: 32, footprint: 1, maxSlope: 1.8, minElev: 2400, maxElev: 4500, capacity: 1400, downhillShare: 0.2, upkeep: 6200, speed: 9, minSpan: 12, maxSpan: 34, color: "#5fa8d3" },
  { id: "hotel-resort", category: "buildings", name: "Resort-Hotel", blurb: "480 Betten. Traegt ein Gebiet durch die ganze Saison.", cost: 320000, gemCost: 140, xp: 300, unlockLevel: 14, buildSeconds: 34, footprint: 1, maxSlope: 0.16, minElev: 1560, maxElev: 2000, beds: 480, upkeep: 7000, color: "#2b1f1a" },
  { id: "gastro-hall", category: "buildings", name: "Bergrestaurant XL", blurb: "Selbstbedienung fuer 1.400 Gaeste pro Stunde.", cost: 96000, xp: 150, unlockLevel: 10, buildSeconds: 22, footprint: 1, maxSlope: 0.3, minElev: 1560, maxElev: 3400, upkeep: 2100, seatsPerHour: 1400, satisfactionBonus: 2.2, color: "#7a4520" },
  { id: "depot", category: "services", name: "Betriebszentrale", blurb: "Zentrale Werkstatt. Senkt den Unterhalt aller Bahnen deutlich.", cost: 120000, xp: 160, unlockLevel: 11, buildSeconds: 24, footprint: 1, maxSlope: 0.26, minElev: 1560, maxElev: 2200, upkeep: 1800, upkeepCut: 0.35, color: "#4a4a4a" },
  { id: "cablecar-museum", category: "deco", name: "Bahnen-Museum", blurb: "Prestige. Zieht Gaeste auch im Sommer ins Tal.", cost: 78000, gemCost: 40, xp: 130, unlockLevel: 16, buildSeconds: 20, footprint: 1, maxSlope: 0.24, minElev: 1560, maxElev: 2200, upkeep: 1200, satisfactionBonus: 3, summerDraw: 0.3, color: "#8f7a4a" },
];

export const BY_ID: Record<ItemId, CatalogItem> = Object.fromEntries(
  CATALOG.map((c) => [c.id, c]),
) as Record<ItemId, CatalogItem>;

export const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: "lifts", label: "Bergbahnen", hint: "Seilbahnen & Lifte" },
  { id: "buildings", label: "Gebäude", hint: "Hotels, Shops & mehr" },
  { id: "pistes", label: "Pisten & Wege", hint: "Pisten, Routen & Strassen" },
  { id: "deco", label: "Dekoration", hint: "Baeume, Felsen & Objekte" },
  { id: "services", label: "Dienste", hint: "Werkstaetten, Parken & Co." },
];

export const QUICK: ItemId[] = ["chair", "gondola", "tbar", "restaurant", "groomer", "viewpoint"];

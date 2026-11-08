import type { ItemId } from "./ids.ts";

/**
 * Research ("Forschung"): a small tree of lasting improvements, paid for with
 * research points (FP) that running the resort produces.
 *
 * Every number the research engine uses lives here. Effects are declared as
 * data on each node and folded together by `researchEffects` in the engine,
 * so a new node is a new entry in this file and nothing else.
 */

export type ResearchBranchId = "bahnen" | "dorf" | "pisten" | "gaeste" | "betrieb" | "allianz";

export interface ResearchBranchDef {
  id: ResearchBranchId;
  label: string;
  hint: string;
  /** Accent colour of the column. */
  color: string;
  /** Nodes in this branch need every player's pledge before they can start. */
  alliance?: boolean;
}

/**
 * What a finished node changes. Factors multiply (1 = no change), the rest add.
 * Absent fields change nothing.
 */
export interface ResearchEffect {
  /** × guests who want to come. */
  demand?: number;
  /** × ticket income. */
  ticket?: number;
  /** × queueing time. */
  wait?: number;
  /** × running costs. */
  upkeep?: number;
  /** + snow quality (0..1 scale). */
  snow?: number;
  /** × throughput of every lift. */
  liftCapacity?: number;
  /** × throughput of these lift types only. */
  liftCapacityByItem?: Partial<Record<ItemId, number>>;
  /** × capacity of every run. */
  pisteCapacity?: number;
  /** × metres of snow line each snow cannon buys back (and its cap). */
  snowmakerDrop?: number;
  /** × price of everything built. */
  buildCostFactor?: number;
  /** + satisfaction points. */
  satisfaction?: number;
  /** × the match's teamwork bonus. */
  teamworkFactor?: number;
  /** × research points earned. */
  researchSpeed?: number;
  /** + share of cableway upkeep removed, on top of the best workshop. */
  upkeepCut?: number;
  /** × the extra operating hours floodlights give. */
  lightsFactor?: number;
  /** + extra capacity a ski school gives the easy runs. */
  schoolBonus?: number;
  /** + extra capacity mountain rescue gives the steep runs. */
  clinicBonus?: number;
  /** + share of demand that comes regardless of reputation. */
  reputationFloor?: number;
  /** Grades an event can no longer close. */
  keepOpen?: ("blue" | "red" | "black" | "park")[];
  /**
   * Items this node makes buildable. An item named here can be built only
   * once the node is researched, whatever the level: new lift types and
   * buildings come from research, not from playing long enough.
   */
  unlocks?: ItemId[];
}

export interface ResearchNodeDef {
  id: string;
  branch: ResearchBranchId;
  /** 1..4: row in the tree, and what the default price is. */
  tier: number;
  name: string;
  /** Short line for the card. */
  effectText: string;
  /** A sentence of flavour for the detail view. */
  blurb: string;
  /** lucide icon name, resolved by the UI. */
  icon: string;
  requires: string[];
  /** Overrides the tier price. */
  cost?: number;
  effect: ResearchEffect;
}

export const RESEARCH = {
  /**
   * Research points per in-game day, from running the resort.
   *
   * A starter resort (one T-bar and a blue run) makes about 6 FP a day, so a
   * first node takes a round; a resort earning medals makes 25–60. Guests and
   * vertical metres both count, so a busy village and a big mountain each pay.
   */
  basePerDay: 6,
  /** Guests per day for one FP per day. */
  guestsPerPoint: 10,
  /** Vertical metres per day for one FP per day. */
  verticalPerPoint: 15000,
  /** Default price of a node by tier (index = tier). */
  tierCost: [0, 30, 80, 160, 300],
  /** Nodes that can wait in line behind the running one. */
  queueMax: 3,
  /** "Mit Geld beschleunigen": this many FP for this many CHF. */
  boost: { points: 10, coins: 5000 },
  /** Ceiling on the share of cableway upkeep removed, workshops and research together. */
  maxUpkeepCut: 0.6,
  /** Ceiling on the reputation floor research can reach. */
  maxReputationFloor: 0.8,
} as const;

export const RESEARCH_BRANCHES: ResearchBranchDef[] = [
  { id: "bahnen", label: "Bahnen", hint: "Neue Bahntypen und mehr Leute den Berg hinauf", color: "#2F6FED" },
  { id: "dorf", label: "Dorf & Hotels", hint: "Neue Hotels und Gebäude", color: "#C2703D" },
  { id: "pisten", label: "Pisten & Schnee", hint: "Länger offen, mehr Platz", color: "#4aa3c7" },
  { id: "gaeste", label: "Gäste & Marketing", hint: "Mehr Gäste, mehr Umsatz", color: "#F4B942" },
  { id: "betrieb", label: "Betrieb", hint: "Günstiger und ruhiger laufen", color: "#7C8DA6" },
  { id: "allianz", label: "Allianz", hint: "Nur gemeinsam: alle müssen zustimmen", color: "#34A853", alliance: true },
];

export const RESEARCH_NODES: ResearchNodeDef[] = [
  // Bahnen
  {
    id: "gondelbau",
    branch: "bahnen",
    tier: 1,
    name: "Gondelbau",
    effectText: "Gondelbahn baubar",
    blurb: "Geschlossene Kabinen, die auch talwärts fahren – der erste Schritt zur grossen Bahn.",
    icon: "Cable",
    requires: [],
    effect: { unlocks: ["gondola"] },
  },
  {
    id: "pendelbahn",
    branch: "bahnen",
    tier: 2,
    name: "Pendelbahn-Technik",
    effectText: "Pendelbahn baubar",
    blurb: "Zwei grosse Kabinen an dicken Tragseilen, über Felswände hinweg.",
    icon: "CableCar",
    requires: ["gondelbau"],
    effect: { unlocks: ["tram"] },
  },
  {
    id: "kuppelbar",
    branch: "bahnen",
    tier: 1,
    name: "Kuppelbare Sessel",
    effectText: "+20 % Sessellift, +10 % Gondel",
    blurb: "Die Sessel klinken sich in der Station aus – langsam einsteigen, schnell fahren.",
    icon: "Armchair",
    requires: [],
    effect: { liftCapacityByItem: { chair: 1.2, gondola: 1.1 } },
  },
  {
    id: "sitzheizung",
    branch: "bahnen",
    tier: 2,
    name: "Sitzheizung",
    effectText: "+3 Zufriedenheit",
    blurb: "Warme Sitze bei minus 15 Grad. Niemand beschwert sich mehr über den Sessellift.",
    icon: "Flame",
    requires: ["kuppelbar"],
    effect: { satisfaction: 3 },
  },
  {
    id: "kabinen",
    branch: "bahnen",
    tier: 2,
    name: "Schnellere Kabinen",
    effectText: "+8 % alle Bahnen, −6 % Wartezeit",
    blurb: "Neue Antriebe und Kabinen, die schneller durch die Station laufen.",
    icon: "Gauge",
    requires: ["kuppelbar"],
    effect: { liftCapacity: 1.08, wait: 0.94 },
  },
  {
    id: "funitel",
    branch: "bahnen",
    tier: 3,
    name: "Funitel-Lizenz",
    effectText: "Funitel baubar",
    blurb: "Zwei Tragseile, sturmsicher – die Bewilligung kommt schneller, wenn die Pläne schon stehen.",
    icon: "Cable",
    requires: ["kabinen", "pendelbahn"],
    effect: { unlocks: ["funitel"] },
  },
  {
    id: "gletscher",
    branch: "bahnen",
    tier: 4,
    name: "Gletschererschliessung",
    effectText: "Gletscherbahn baubar",
    blurb: "Gutachten, Messungen, Einsprachen – erledigt. Der Gletscher kann kommen.",
    icon: "MountainSnow",
    requires: ["funitel"],
    effect: { unlocks: ["glacier"] },
  },

  // Pisten & Schnee
  {
    id: "praeparierung",
    branch: "pisten",
    tier: 1,
    name: "Pistenpräparierung",
    effectText: "Pistenraupe baubar, +10 % Pistenkapazität",
    blurb: "Breiter gewalzt, sauberer Cord. Auf derselben Piste haben mehr Leute Platz.",
    icon: "Snowflake",
    requires: [],
    effect: { pisteCapacity: 1.1, unlocks: ["groomer"] },
  },
  {
    id: "beschneiung2",
    branch: "pisten",
    tier: 2,
    name: "Beschneiung 2.0",
    effectText: "Beschneiung baubar, +40 % Wirkung",
    blurb: "Lanzen statt Propeller, Steuerung nach Feuchtkugeltemperatur.",
    icon: "CloudSnow",
    requires: ["praeparierung"],
    effect: { snowmakerDrop: 1.4, unlocks: ["snowmaker"] },
  },
  {
    id: "nachtski",
    branch: "pisten",
    tier: 2,
    name: "Nachtski",
    effectText: "Flutlicht baubar, wirkt doppelt",
    blurb: "Abends unter Flutlicht auf der Piste.",
    icon: "Moon",
    requires: ["praeparierung"],
    effect: { lightsFactor: 2, unlocks: ["lights"] },
  },
  {
    id: "snowpark",
    branch: "pisten",
    tier: 2,
    name: "Snowpark-Bau",
    effectText: "Snowpark baubar",
    blurb: "Kicker, Rails, Halfpipe: ein Shaper-Team zieht junge Gäste an.",
    icon: "Mountain",
    requires: ["praeparierung"],
    effect: { unlocks: ["snowpark"] },
  },
  {
    id: "lawinenschutz",
    branch: "pisten",
    tier: 3,
    name: "Lawinenschutz",
    effectText: "Schwarze Pisten bleiben bei Ereignissen offen",
    blurb: "Sprengmasten und Verbauungen: Steilhänge müssen nicht mehr gesperrt werden.",
    icon: "ShieldCheck",
    requires: ["beschneiung2"],
    effect: { keepOpen: ["black"], snow: 0.03 },
  },
  {
    id: "snowfarming",
    branch: "pisten",
    tier: 4,
    name: "Snowfarming",
    effectText: "+8 % Schneequalität, +1 Zufriedenheit",
    blurb: "Schnee vom Vorjahr unter Sägemehl über den Sommer gerettet.",
    icon: "Warehouse",
    requires: ["lawinenschutz"],
    effect: { snow: 0.08, satisfaction: 1 },
  },

  // Gäste & Marketing
  {
    id: "oev",
    branch: "gaeste",
    tier: 1,
    name: "ÖV-Partnerschaft",
    effectText: "Busbahnhof baubar",
    blurb: "Postauto und Bahn im Takt: Gäste kommen ohne Auto.",
    icon: "Bus",
    requires: [],
    effect: { unlocks: ["bus"] },
  },
  {
    id: "onlinetickets",
    branch: "gaeste",
    tier: 1,
    name: "Online-Tickets",
    effectText: "+6 % Ticketeinnahmen",
    blurb: "Am Abend vorher kaufen, direkt aufs Drehkreuz. Weniger Gratisfahrer.",
    icon: "Smartphone",
    requires: [],
    effect: { ticket: 1.06 },
  },
  {
    id: "marketing",
    branch: "gaeste",
    tier: 2,
    name: "Marketing-Kampagne",
    effectText: "+10 % Nachfrage",
    blurb: "Plakate im Unterland, Clips im Netz – und plötzlich will jeder hierher.",
    icon: "Megaphone",
    requires: ["onlinetickets"],
    effect: { demand: 1.1 },
  },
  {
    id: "skischule",
    branch: "gaeste",
    tier: 2,
    name: "Skischul-Programm",
    effectText: "Skischule baubar und doppelt so wirksam",
    blurb: "Kinderland, Gruppenkurse, Tageskarte inklusive.",
    icon: "GraduationCap",
    requires: ["onlinetickets"],
    effect: { schoolBonus: 0.08, satisfaction: 1, unlocks: ["skischool"] },
  },
  {
    id: "saisonkarten",
    branch: "gaeste",
    tier: 3,
    name: "Saisonkarten",
    effectText: "Stabilere Nachfrage, +4 % Gäste",
    blurb: "Stammgäste kommen auch nach einem schlechten Tag wieder.",
    icon: "IdCard",
    requires: ["marketing"],
    effect: { reputationFloor: 0.12, demand: 1.04 },
  },

  // Betrieb
  {
    id: "energie",
    branch: "betrieb",
    tier: 1,
    name: "Energiemanagement",
    effectText: "Werkstatt baubar, −8 % Unterhalt",
    blurb: "Bahnen fahren nach Andrang, nicht nach Fahrplan.",
    icon: "Zap",
    requires: [],
    effect: { upkeep: 0.92, unlocks: ["workshop"] },
  },
  {
    id: "werkstatt",
    branch: "betrieb",
    tier: 2,
    name: "Werkstatt-Netz",
    effectText: "−10 % Unterhalt der Bahnen",
    blurb: "Ersatzteile im Tal, Mechaniker auf Abruf, Revision im Sommer.",
    icon: "Wrench",
    requires: ["energie"],
    effect: { upkeepCut: 0.1 },
  },
  {
    id: "rettungsdienst",
    branch: "betrieb",
    tier: 2,
    name: "Rettungsdienst",
    effectText: "Bergrettung baubar und stärker",
    blurb: "Pistenpatrouille mit Funk und Akja. Wer sich sicher fühlt, fährt auch Schwarz.",
    icon: "Siren",
    requires: ["energie"],
    effect: { clinicBonus: 0.08, satisfaction: 2, unlocks: ["clinic"] },
  },
  {
    id: "leitzentrale",
    branch: "betrieb",
    tier: 3,
    name: "Digitale Leitzentrale",
    effectText: "Betriebszentrale baubar, −10 % Wartezeit",
    blurb: "Alle Bahnen auf einem Bildschirm. Staus werden gelöst, bevor sie entstehen.",
    icon: "MonitorDot",
    requires: ["werkstatt"],
    effect: { wait: 0.9, upkeep: 0.95, unlocks: ["depot"] },
  },

  // Dorf & Hotels
  {
    id: "gastgewerbe",
    branch: "dorf",
    tier: 1,
    name: "Gastgewerbe",
    effectText: "Hotel ★ und Après-Ski baubar",
    blurb: "Betten im Dorf und Musik nach dem letzten Bügel: Gäste bleiben länger.",
    icon: "BedDouble",
    requires: [],
    effect: { unlocks: ["hotel1", "apres"] },
  },
  {
    id: "hotelkette",
    branch: "dorf",
    tier: 2,
    name: "Hotelkette",
    effectText: "Hotel ★★★ baubar",
    blurb: "Halbpension, Lift vor der Tür, Wochenpauschale.",
    icon: "Hotel",
    requires: ["gastgewerbe"],
    effect: { unlocks: ["hotel3"] },
  },
  {
    id: "wellness",
    branch: "dorf",
    tier: 2,
    name: "Wellness",
    effectText: "Berg-Spa baubar",
    blurb: "Sauna mit Blick auf den Gipfel – auch im Sommer ein Grund zu kommen.",
    icon: "Bath",
    requires: ["gastgewerbe"],
    effect: { unlocks: ["spa"] },
  },
  {
    id: "luxus",
    branch: "dorf",
    tier: 3,
    name: "Luxushotellerie",
    effectText: "Palace und Bergrestaurant XL baubar",
    blurb: "Fünf Sterne und ein Restaurant für 1'400 Gäste pro Stunde.",
    icon: "Crown",
    requires: ["hotelkette"],
    effect: { unlocks: ["hotel5", "gastro-hall"] },
  },
  {
    id: "resort",
    branch: "dorf",
    tier: 4,
    name: "Resort-Entwicklung",
    effectText: "Resort-Hotel und Bahnen-Museum baubar",
    blurb: "Ein ganzes Quartier und ein Museum, das Gäste auch im Sommer bringt.",
    icon: "Building2",
    requires: ["luxus", "wellness"],
    effect: { unlocks: ["hotel-resort", "cablecar-museum"] },
  },

  // Allianz: only together.
  {
    id: "einkauf",
    branch: "allianz",
    tier: 1,
    name: "Gemeinsamer Einkauf",
    effectText: "−8 % Baukosten",
    blurb: "Zwei Unterschriften, ein Grosshändler. Stahl und Beton werden günstiger.",
    icon: "Handshake",
    requires: [],
    effect: { buildCostFactor: 0.92 },
  },
  {
    id: "funk",
    branch: "allianz",
    tier: 2,
    name: "Funkverbindung",
    effectText: "Teamwork-Bonus +50 %, −5 % Wartezeit",
    blurb: "Berg und Tal sprechen miteinander. Wer zusammen baut, bekommt mehr.",
    icon: "RadioTower",
    requires: ["einkauf"],
    effect: { teamworkFactor: 1.5, wait: 0.95 },
  },
  {
    id: "tourismus",
    branch: "allianz",
    tier: 2,
    name: "Partnerschaft Tourismusbüro",
    effectText: "+8 % Nachfrage",
    blurb: "Das Dorf wirbt für den Berg und der Berg für das Dorf.",
    icon: "Landmark",
    requires: ["einkauf"],
    effect: { demand: 1.08 },
  },
  {
    id: "vision",
    branch: "allianz",
    tier: 3,
    name: "Gemeinsame Vision",
    effectText: "+25 % Forschung, +2 Zufriedenheit",
    blurb: "Ein Plan, zwei Köpfe. Ihr wisst, wohin das Gebiet will.",
    icon: "Sparkles",
    requires: ["funk", "tourismus"],
    effect: { researchSpeed: 1.25, satisfaction: 2 },
  },
];

export const RESEARCH_BY_ID: Record<string, ResearchNodeDef> = Object.fromEntries(
  RESEARCH_NODES.map((n) => [n.id, n]),
);

/** The research node an item waits for, if any; derived from the nodes' `unlocks`. */
export const RESEARCH_GATE: Partial<Record<ItemId, string>> = Object.fromEntries(
  RESEARCH_NODES.flatMap((n) => (n.effect.unlocks ?? []).map((item) => [item, n.id])),
) as Partial<Record<ItemId, string>>;

/** What a node costs in FP. */
export function researchCost(node: ResearchNodeDef): number {
  return node.cost ?? RESEARCH.tierCost[node.tier] ?? RESEARCH.tierCost[RESEARCH.tierCost.length - 1]!;
}

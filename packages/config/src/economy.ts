/** All balancing numbers. Import these — never copy the literals into engine code. */
export const ECONOMY = {
  startingCoins: 85000,
  startingGems: 40,
  startingStars: 0,
  ticketMin: 39,
  ticketMax: 149,
  ticketDefault: 74,
  /** Price at which guests are exactly as willing to come as not. */
  ticketReference: 74,
  /**
   * How sharply demand falls as the price rises past the reference.
   *
   * Demand is `2 / (1 + (price / reference) ^ elasticity)`, so revenue peaks at
   * an interior price rather than at the cap. Above 1 the curve has a maximum;
   * at 2.4 it sits near 64 CHF, and the satisfaction penalty pulls it lower
   * still. The old rule only bit above 90 CHF, which made 90 strictly optimal
   * and the whole slider free money.
   */
  priceElasticity: 2.4,
  /** Satisfaction points lost per franc charged above the reference price. */
  pricePenaltyPerFranc: 0.12,
  /**
   * Share of demand that shows up regardless of reputation.
   *
   * The rest scales with last tick's satisfaction, which is what closes the
   * loop: long queues cost guests tomorrow, not just points today. Lagging by
   * a tick keeps it stable and self-correcting instead of a death spiral.
   */
  reputationFloor: 0.45,
  hotelRatePerBedPerHour: 18,
  fbPerVisitor: 4.2,
  shopPerVisitor: 2.1,
  /** Guests one restaurant, hut or apres bar can actually serve per hour. */
  restaurantSeatsPerHour: 420,
  /** Guests one sport shop can serve per hour. */
  shopVisitorsPerHour: 600,
  /** Extra capacity a ski school gives the easy runs. */
  schoolBonus: 0.08,
  /** Extra capacity mountain rescue gives the steep runs. */
  clinicBlackBonus: 0.07,
  lightsDayExtension: 0.12,
  snowmakerQuality: 0.12,
  groomerWaitCut: 0.18,
  workshopUpkeepCut: 0.15,
  parkingDemandPerHour: 140,
  busDemandPerHour: 110,
  walkInPerHour: 36,
  bedOvernightShare: 0.42,
  /** Share of hourly guests who take a hotel bed. */
  occupancyPerVisitor: 0.15,
  /** Ticket revenue uplift per ticket office. */
  ticketOfficeIncomeBonus: 0.08,
  /** Satisfaction points lost per minute of queueing. */
  waitPenaltyPerMinute: 1.19,
  varietyBonus: 6,
  targetSatisfaction: 72,
  /** Satisfaction points from a full-quality snowpack. */
  snowSatisfactionWeight: 12,
  restaurantSatisfaction: 1.4,
  shopSatisfaction: 1.1,
  ticketOfficeSatisfaction: 0.8,
  /** Satisfaction points a mountain spa adds. */
  spaSatisfaction: 6,
  minSatisfaction: 28,
  maxSatisfaction: 99,
  daySecondsReal: 90,
  simTickMs: 1000,
  persistMs: 4000,
  maxVisualSkiers: 56,
  maxVisualGondolas: 22,
  maxTreesHigh: 720,
  maxTreesLow: 260,
} as const;

/**
 * Shape of the transport graph the sim routes guests through.
 *
 * Everything here decides *whether* a layout works, as opposed to how much it
 * earns — those numbers stay in ECONOMY.
 */
export const FLOW = {
  /**
   * Stations and piste ends within this many hexes count as the same place.
   * Raising it forgives sloppy layouts; lowering it demands precise joins.
   */
  linkRadius: 2,
  /** Guests must ride at least one lift before they count as served. */
  requireLift: true,
  /** Ceiling on how much wait a saturated edge can add, in minutes. */
  maxWaitMinutes: 28,
  /** Wait added when the busiest edge on the mountain is fully saturated. */
  saturationWaitMinutes: 22,
  /** Baseline wait even on a completely empty lift. */
  baseWaitMinutes: 2.2,
  /** An edge at or above this share of capacity is reported as a bottleneck. */
  bottleneckThreshold: 0.92,
  /** Hex length of one piste segment, in kilometres. */
  kmPerSegment: 0.12,
} as const;

export const LEVEL = {
  base: 90,
  exponent: 1.65,
  max: 40,
} as const;

export const UPGRADES = [
  { key: "speed" as const, label: "Geschwindigkeit", max: 3, cost: [1500, 4200, 9000] },
  { key: "cabins" as const, label: "Kabinen", max: 3, cost: [2200, 5600, 12000] },
  { key: "capacity" as const, label: "Kapazität", max: 3, cost: [1800, 5000, 11000] },
];

export type UpgradeKey = (typeof UPGRADES)[number]["key"];

/** All balancing numbers. Import these — never copy the literals into engine code. */
export const ECONOMY = {
  startingCoins: 85000,
  startingGems: 40,
  startingStars: 0,
  ticketMin: 39,
  ticketMax: 149,
  ticketDefault: 74,
  hotelRatePerBedPerHour: 18,
  fbPerVisitor: 4.2,
  shopPerVisitor: 2.1,
  schoolBonus: 0.08,
  spaBonus: 0.06,
  lightsDayExtension: 0.12,
  snowmakerQuality: 0.12,
  groomerWaitCut: 0.18,
  workshopUpkeepCut: 0.15,
  clinicBlackBonus: 0.07,
  parkingDemandPerHour: 140,
  busDemandPerHour: 110,
  walkInPerHour: 36,
  bedOvernightShare: 0.42,
  waitPenaltyPerMinute: 3.4,
  varietyBonus: 6,
  targetSatisfaction: 72,
  daySecondsReal: 90,
  simTickMs: 1000,
  persistMs: 4000,
  maxVisualSkiers: 56,
  maxVisualGondolas: 22,
  maxTreesHigh: 720,
  maxTreesLow: 260,
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

import { defaultSaveName, type SaveSummary } from "@ski/shared";
import { fmt } from "./format";

/** "Sa 8.11. 21:30" in Swiss time. */
export const when = defaultSaveName;

/** "Saison 2 · Tag 14 · 3 Lifte · 5 Pisten · 82'000 CHF", plus the round in a match. */
export function summaryLine(s: SaveSummary): string {
  const parts = [`Saison ${s.season}`, `Tag ${s.day}`];
  if (s.round !== undefined && s.rounds !== undefined) parts.push(`Runde ${s.round}/${s.rounds}`);
  parts.push(`${s.lifts} ${s.lifts === 1 ? "Lift" : "Lifte"}`, `${s.pistes} ${s.pistes === 1 ? "Piste" : "Pisten"}`);
  parts.push(`${fmt(s.coins)} CHF`);
  return parts.join(" · ");
}

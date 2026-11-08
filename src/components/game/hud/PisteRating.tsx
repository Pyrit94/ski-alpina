import { Star } from "lucide-react";
import type { PisteScore } from "@ski/shared";

/** «72 P. ★★★★☆»: a run's rating in one chip. */
export function RatingChip({ points, stars }: { points: number; stars: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-coin/15 px-2 py-0.5 text-[10px] font-bold text-navy" aria-label={`${points} Pistenpunkte, ${stars} von 5 Sternen`}>
      <span className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={`size-2.5 ${i <= stars ? "fill-coin text-coin" : "text-line"}`} />
        ))}
      </span>
      {points} P.
    </span>
  );
}

const PARTS: { key: keyof PisteScore["parts"]; label: string; max: number }[] = [
  { key: "drop", label: "Gefälle", max: 25 },
  { key: "length", label: "Länge", max: 20 },
  { key: "turns", label: "Schwünge", max: 30 },
  { key: "variety", label: "Abwechslung", max: 25 },
];

/** Where the points come from, as four small bars. */
export function RatingParts({ score }: { score: PisteScore }) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {PARTS.map((p) => (
        <div key={p.key} className="rounded-[10px] bg-ice px-1.5 py-1 text-center">
          <div className="text-[9px] font-semibold text-muted">{p.label}</div>
          <div className="mx-auto mt-0.5 h-1 w-full overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-coin" style={{ width: `${(score.parts[p.key] / p.max) * 100}%` }} />
          </div>
          <div className="value mt-0.5 text-[10px] font-bold text-navy">
            {score.parts[p.key]}/{p.max}
          </div>
        </div>
      ))}
    </div>
  );
}

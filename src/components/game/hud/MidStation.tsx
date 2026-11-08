import { useEffect, useMemo, useState } from "react";
import { Check, MapPin } from "lucide-react";
import { GRADE_LABEL } from "@/lib/game/catalog";
import { getDem, midStationCost, midStationSpots, missingLegs, STATION_LEGS, starsFor, type ResortState, type StationLeg } from "@ski/shared";
import { liftNames } from "@/lib/game/assist";
import { MIXES } from "@/lib/game/auto-pistes";
import { fmt } from "@/lib/game/format";
import { GRADE_COLOR } from "@/lib/game/piste-editor";
import { usePlanner } from "@/lib/game/planner";
import { plannerState } from "@/lib/game/planner-jobs";
import { play } from "@/lib/game/sound";
import { useGame } from "@/lib/game/store";
import { useMyMoney } from "@/lib/game/team";
import { useStableGame } from "../canvas/use-stable-game";
import { Calculating } from "./Calculating";
import { HelperButton, HelperCard, HelperFooter, HelperNote } from "./HelperCard";
import { RatingChip } from "./PisteRating";

const LEG_LABEL: Record<StationLeg, string> = {
  "top-mid": "Berg → Mitte",
  "mid-base": "Mitte → Tal",
  "top-base": "Berg → Tal",
};
const SPOT_LABELS = ["Weiter unten", "In der Mitte", "Weiter oben"];

/** The link in a lift's panel that opens the mid-station planner for it. */
export function MidStationLink({ liftId }: { liftId: string }) {
  const openHelper = useGame((s) => s.openHelper);
  return (
    <button
      type="button"
      onClick={() => openHelper({ id: "midstation", liftId })}
      className="mt-1 flex min-h-11 items-center gap-1.5 text-[12px] font-semibold text-accent"
    >
      <MapPin className="size-4" /> Mittelstation bauen
    </button>
  );
}

/**
 * «Mittelstation»: a stop part-way up, where guests get on and off and runs
 * can start or end. Three places along the line to choose from, and the runs
 * that come with it — top to stop, stop to valley, top to valley — each on or
 * off, laid out the way the piste assistant lays them out.
 */
export function MidStationPanel() {
  const liftId = useGame((s) => (s.helper?.id === "midstation" ? s.helper.liftId : null));
  const openHelper = useGame((s) => s.openHelper);
  const lifts = useStableGame((s) => s.lifts);
  const buildings = useStableGame((s) => s.buildings);
  const pistes = useStableGame((s) => s.pistes);
  const research = useStableGame((s) => s.research);
  const mix = useGame((s) => s.pisteMix);
  const money = useMyMoney().mine;
  // In thousands: takings change every second, and replanning every second
  // (the simulation, dozens of times) would make the panel stutter.
  const budgetK = Math.floor(money / 1000);
  const [pick, setPick] = useState<number | null>(null);
  const [legs, setLegs] = useState<StationLeg[] | null>(null);
  // Another lift: start over with its places and runs.
  const [forLift, setForLift] = useState(liftId);
  if (forLift !== liftId) {
    setForLift(liftId);
    setPick(null);
    setLegs(null);
  }
  const lift = liftId ? lifts.find((l) => l.id === liftId && !l.mid) : undefined;
  const spots = useMemo(() => {
    if (!lift) return [];
    const all = midStationSpots({ ...useGame.getState(), lifts, buildings, pistes } as unknown as ResortState, getDem(), lift.id);
    if (all.length <= 3) return all;
    return [all[Math.floor(all.length * 0.25)]!, all[Math.floor(all.length / 2)]!, all[Math.floor(all.length * 0.75)]!];
  }, [lift, lifts, buildings, pistes]);
  const stationCost = lift ? midStationCost({ ...useGame.getState(), research } as unknown as ResortState, lift.itemId) : 0;
  const spot = spots.length === 0 ? null : spots[pick ?? Math.floor((spots.length - 1) / 2)]!;
  const chosen = useMemo(
    () => legs ?? (lift ? missingLegs({ ...useGame.getState(), lifts, pistes } as unknown as ResortState, getDem(), lift.id) : []),
    [legs, lift, lifts, pistes],
  );
  // The assistant's own way of picking lines: every grade asked for, plain
  // and with swings, judged by the simulation and the run's rating.
  // Worked out in the planner worker, so the panel answers taps meanwhile.
  const { result: planned, busy } = usePlanner<"station">(
    () =>
      lift && spot
        ? {
            kind: "station",
            state: plannerState(useGame.getState(), { lifts, pistes, buildings, research }),
            liftId: lift.id,
            mid: spot,
            legs: chosen,
            opts: { mix, budget: Math.max(0, budgetK * 1000 - stationCost) },
          }
        : null,
    [lift, spot, chosen, mix, lifts, pistes, buildings, research, budgetK, stationCost],
  );
  const plan = lift && spot ? planned : null;

  useEffect(() => {
    useGame.setState({ autoPreview: plan ? plan.runs.map((r) => ({ hexes: r.hexes, grade: r.grade })) : [] });
  }, [plan]);
  useEffect(() => () => useGame.setState({ autoPreview: [] }), []);

  if (!liftId) return null;
  const close = () => openHelper(null);
  if (!lift) {
    return (
      <HelperCard icon={MapPin} title="Mittelstation" subtitle="Ein Halt auf halber Strecke" onClose={close}>
        <HelperNote>Diese Bahn hat schon eine Mittelstation oder steht nicht mehr.</HelperNote>
      </HelperCard>
    );
  }
  const name = liftNames(lifts).get(lift.id) ?? "";
  const toggle = (leg: StationLeg) => setLegs(chosen.includes(leg) ? chosen.filter((l) => l !== leg) : [...chosen, leg]);
  const total = stationCost + (plan?.cost ?? 0);
  const build = () => {
    if (!spot) return;
    useGame.getState().sendPlan([
      { type: "add_mid_station", liftId: lift.id, q: spot.q, r: spot.r },
      ...(plan?.runs ?? []).map((r) => ({ type: "place_piste" as const, itemId: "piste" as const, hexes: r.hexes })),
    ]);
    play("build");
    close();
  };

  return (
    <HelperCard
      icon={MapPin}
      title="Mittelstation"
      subtitle={`${name} · Station ${fmt(stationCost)}`}
      onClose={close}
      busy={busy && !!plan}
      footer={
        spots.length > 0 ? (
          <HelperFooter summary={plan && plan.runs.length > 0 ? "Die Pisten sind auf der Karte gestrichelt" : undefined}>
            <HelperButton variant="secondary" onClick={close}>
              Abbrechen
            </HelperButton>
            <HelperButton grow disabled={!spot || busy || money < total} onClick={build}>
              {money < stationCost
                ? "Zu wenig Geld"
                : `Bauen${plan && plan.runs.length > 0 ? ` mit ${plan.runs.length} ${plan.runs.length === 1 ? "Piste" : "Pisten"}` : ""} · ${fmt(total)}`}
            </HelperButton>
          </HelperFooter>
        ) : undefined
      }
    >
      <HelperNote tone="muted">Gäste steigen unterwegs ein und aus, Pisten können dort beginnen und enden.</HelperNote>
      {spots.length === 0 ? (
        <HelperNote tone="warn">Auf dieser Linie ist kein Platz für eine Station – zu steil oder zu kurz.</HelperNote>
      ) : (
        <>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${spots.length}, minmax(0, 1fr))` }}>
            {spots.map((h, i) => (
              <button
                key={`${h.q},${h.r}`}
                type="button"
                aria-pressed={spot === h}
                onClick={() => setPick(i)}
                className={`min-h-11 rounded-full px-2 text-[11px] font-bold ${spot === h ? "bg-accent text-panel" : "bg-ice text-navy"}`}
              >
                {spots.length === 3 ? SPOT_LABELS[i] : `Platz ${i + 1}`}
              </button>
            ))}
          </div>

          <div className="px-0.5 text-[11px] font-semibold text-navy">Pisten dazu</div>
          <div className="grid grid-cols-4 gap-0.5 rounded-full bg-ice p-0.5">
            {MIXES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mix === m.id}
                onClick={() => useGame.setState({ pisteMix: m.id })}
                className={`min-h-11 rounded-full text-[11px] font-semibold ${mix === m.id ? "bg-accent text-panel" : "text-navy"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {!plan ? (
            <Calculating className="" />
          ) : (
            <ul className="flex flex-col gap-1">
              {STATION_LEGS.map((leg) => {
                const on = chosen.includes(leg);
                const run = plan.runs.find((r) => r.leg === leg);
                const miss = plan.missed.find((m) => m.leg === leg);
                return (
                  <li key={leg}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() => toggle(leg)}
                      className={`flex min-h-11 w-full items-center gap-2 rounded-[12px] px-2.5 text-left text-[12px] ${on ? "bg-ice text-navy" : "bg-ice/40 text-muted"}`}
                    >
                      <span className={`grid size-5 shrink-0 place-items-center rounded-md border-2 ${on ? "border-accent bg-accent text-panel" : "border-line"}`}>
                        {on && <Check className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{LEG_LABEL[leg]}</span>
                        {on && run && mix !== "mixed" && run.grade !== mix && (
                          <span className="block text-[10px] font-normal text-warn">
                            Nur als {GRADE_LABEL[run.grade as keyof typeof GRADE_LABEL].toLowerCase()} Piste möglich
                          </span>
                        )}
                      </span>
                      {on && run && (
                        <>
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: GRADE_COLOR[run.grade as keyof typeof GRADE_COLOR] }}
                            aria-label={GRADE_LABEL[run.grade as keyof typeof GRADE_LABEL]}
                          />
                          <RatingChip points={run.points} stars={starsFor(run.points)} />
                          <span className="value shrink-0 text-[11px]">{fmt(run.cost)}</span>
                        </>
                      )}
                      {on && miss && (
                        <span className="shrink-0 text-[10px] text-warn">{miss.reason === "budget" ? "Zu wenig Geld" : "Gelände lässt keine zu"}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </HelperCard>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BedDouble, CableCar, Car, ShoppingBag, Utensils, Wand2 } from "lucide-react";
import { BY_ID } from "@ski/config";
import { getDem, hexToWorld, itemUnlocked, siteContext, siteFactors } from "@ski/shared";
import { computeNeeds, NEED_SHORT, type Need, type NeedKey } from "@/lib/game/needs";
import { buildAtBest, pct } from "@/lib/game/placement";
import { fmt } from "@/lib/game/format";
import { play } from "@/lib/game/sound";
import { useGame } from "@/lib/game/store";
import { useMyMoney } from "@/lib/game/team";
import { usePlanner } from "@/lib/game/planner";
import { plannerState } from "@/lib/game/planner-jobs";
import { useStableGame } from "../canvas/use-stable-game";
import { Calculating } from "./Calculating";
import { HelperButton, HelperCard, HelperFigure, HelperFooter, HelperNote } from "./HelperCard";

const ICON: Record<NeedKey, typeof Utensils> = {
  food: Utensils,
  shops: ShoppingBag,
  beds: BedDouble,
  access: Car,
  lifts: CableCar,
};

const barColor = (covered: number) => (covered >= NEED_SHORT ? "bg-success" : covered >= 0.6 ? "bg-warn" : "bg-danger");

/**
 * «Bedarf»: five small meters for what guests notice — food, shops, beds, a
 * way in, the queues — and the village optimiser next to them. A tap on a
 * meter says why in numbers and offers the building, placed at its best spot.
 */
export function NeedsStrip() {
  const lifts = useStableGame((s) => s.lifts);
  const pistes = useStableGame((s) => s.pistes);
  const buildings = useStableGame((s) => s.buildings);
  const stats = useGame((s) => s.stats);
  const coins = useGame((s) => s.coins);
  const phase = useGame((s) => s.phase);
  const selectedId = useGame((s) => s.selectedId);
  const busy = useGame((s) => s.helper !== null || s.sheet !== "none");
  const openHelper = useGame((s) => s.openHelper);
  const [open, setOpen] = useState<NeedKey | null>(null);

  const needs = useMemo(
    () =>
      computeNeeds({
        stats,
        buildings,
        coins,
        unlocked: (id) => itemUnlocked(useGame.getState(), id),
        site: siteFactors(siteContext({ lifts, pistes, buildings }, getDem())),
      }),
    [stats, buildings, coins, lifts, pistes],
  );
  if (lifts.length === 0 || phase !== "idle" || selectedId || busy) return null;
  const shown = needs.find((n) => n.key === open) ?? null;

  return (
    <div className="toast-in pointer-events-auto flex w-full max-w-[380px] flex-col gap-1 rounded-[18px] bg-panel/96 p-1 shadow-[var(--shadow-panel)] backdrop-blur-md">
      <div className="flex items-stretch gap-0.5">
        {needs.map((n) => (
          <Meter key={n.key} need={n} active={open === n.key} onClick={() => setOpen(open === n.key ? null : n.key)} />
        ))}
        <button
          type="button"
          onClick={() => openHelper({ id: "village" })}
          className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] bg-ice px-1 text-[9px] font-bold text-navy"
          aria-label="Dorf automatisch neu anordnen"
        >
          <Wand2 className="size-4 text-accent" />
          Dorf ordnen
        </button>
      </div>
      {shown && <NeedDetail need={shown} />}
    </div>
  );
}

function Meter({ need, active, onClick }: { need: Need; active: boolean; onClick: () => void }) {
  const Icon = ICON[need.key];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${need.label}: ${Math.round(need.covered * 100)} % gedeckt`}
      aria-expanded={active}
      className={`flex min-h-11 w-[54px] shrink-0 flex-col items-center justify-center gap-1 rounded-[14px] ${active ? "bg-ice" : ""}`}
    >
      <Icon className={`size-4 ${need.covered < NEED_SHORT ? "text-warn" : "text-navy"}`} />
      <span className="h-1.5 w-9 overflow-hidden rounded-full bg-line">
        <span className={`block h-full rounded-full ${barColor(need.covered)}`} style={{ width: `${Math.max(6, need.covered * 100)}%` }} />
      </span>
      <span className="text-[9px] font-semibold leading-none text-navy">{need.label}</span>
    </button>
  );
}

function NeedDetail({ need }: { need: Need }) {
  return (
    <div className="flex items-center gap-2 rounded-[14px] bg-ice px-2.5 py-1.5">
      <p className="min-w-0 flex-1 text-[11px] leading-snug text-navy">
        <span className="font-bold">{Math.round(need.covered * 100)} % gedeckt.</span> {need.detail}.
      </p>
      {need.itemId && need.covered < 0.999 && (
        <HelperButton onClick={() => buildAtBest(need.itemId!)}>
          {BY_ID[need.itemId].name} <ArrowRight className="size-3.5" />
        </HelperButton>
      )}
    </div>
  );
}

/**
 * The village optimiser: proposes better places for restaurants, shops,
 * hotels and the noisy service buildings, shows the moves on the map, and
 * applies them in one go.
 */
export function VillagePanel() {
  const open = useGame((s) => s.helper?.id === "village");
  const openHelper = useGame((s) => s.openHelper);
  const lifts = useStableGame((s) => s.lifts);
  const pistes = useStableGame((s) => s.pistes);
  const buildings = useStableGame((s) => s.buildings);
  const money = useMyMoney().mine;

  // The plan and the before/after simulation, worked out in the planner worker.
  const { result: planned, busy } = usePlanner<"village">(
    () => (open ? { kind: "village", state: plannerState(useGame.getState(), { lifts, pistes, buildings }) } : null),
    [open, lifts, pistes, buildings],
  );
  const result = open ? planned : null;

  useEffect(() => {
    useGame.setState({
      villagePreview: result ? result.plan.moves.map((m) => ({ from: m.from, to: m.to })) : [],
      // The new roads, dashed like a planned run.
      autoPreview: result ? result.plan.roads.map((hexes) => ({ hexes, grade: "road" })) : [],
    });
  }, [result]);
  // Glide to the proposal once, so the arrows are in view.
  const moves = result?.plan.moves;
  useEffect(() => {
    if (!moves || moves.length === 0) return;
    let x = 0;
    let z = 0;
    for (const m of moves) {
      const a = hexToWorld(m.from.q, m.from.r);
      const b = hexToWorld(m.to.q, m.to.r);
      x += (a.x + b.x) / 2;
      z += (a.z + b.z) / 2;
    }
    useGame.getState().focusOn(x / moves.length, z / moves.length);
  }, [moves]);
  useEffect(() => () => useGame.setState({ villagePreview: [], autoPreview: [] }), []);

  if (!open) return null;
  const close = () => openHelper(null);
  const plan = result?.plan;
  const apply = () => {
    if (!plan || busy) return;
    // Roads first: the moved buildings need them to stand where they go.
    useGame.getState().sendPlan([
      ...plan.roads.map((hexes) => ({ type: "place_piste" as const, itemId: "road" as const, hexes })),
      { type: "rearrange" as const, moves: plan.moves.map((m) => ({ entityId: m.id, q: m.to.q, r: m.to.r })) },
    ]);
    play("build");
    close();
  };
  const tooPoor = plan ? plan.cost > money : false;
  const hasMoves = !!plan && plan.moves.length > 0;

  return (
    <HelperCard
      icon={Wand2}
      title="Dorf ordnen"
      subtitle={plan ? `Lage im Schnitt ${pct(plan.before)}` : "Bessere Plätze für Restaurants, Läden, Hotels"}
      onClose={close}
      busy={busy && !!plan}
      footer={
        hasMoves ? (
          <HelperFooter
            summary={`Pfeile auf der Karte zeigen, wohin was kommt${
              plan.roads.length > 0 ? ` · ${plan.roads.length} ${plan.roads.length === 1 ? "neue Strasse" : "neue Strassen"} gestrichelt` : ""
            }`}
          >
            <HelperButton variant="secondary" onClick={close}>
              Abbrechen
            </HelperButton>
            <HelperButton grow disabled={tooPoor || busy} onClick={apply}>
              {tooPoor ? "Zu wenig Geld" : `${plan.moves.length} verschieben · ${fmt(plan.cost)}`}
            </HelperButton>
          </HelperFooter>
        ) : undefined
      }
    >
      {!result || !plan ? (
        <Calculating className="" />
      ) : plan.moves.length === 0 ? (
        <HelperNote>Alles steht schon an guten Plätzen.</HelperNote>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {plan.moves.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-[12px] bg-ice px-2.5 py-1.5 text-[12px] text-navy">
                <span className="min-w-0 flex-1 truncate font-semibold">{BY_ID[m.itemId].name}</span>
                <span className="shrink-0 text-[10px] text-muted">
                  {Math.max(Math.abs(m.to.q - m.from.q), Math.abs(m.to.r - m.from.r), Math.abs(m.to.q + m.to.r - m.from.q - m.from.r))} Felder
                </span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-1.5">
            <HelperFigure label="Lage im Schnitt">
              {pct(plan.before)} → <span className="text-success">{pct(plan.after)}</span>
            </HelperFigure>
            {result.before && result.after && (
              <HelperFigure label="Gewinn/Tag">
                {fmt(result.before.incomePerHour)} →{" "}
                <span className={result.after.incomePerHour >= result.before.incomePerHour ? "text-success" : "text-danger"}>
                  {fmt(result.after.incomePerHour)}
                </span>
              </HelperFigure>
            )}
          </div>
        </>
      )}
      <HelperNote tone="muted">
        Sucht für Restaurants, Läden und Hotels bessere Plätze: an der Piste, nahe der Talstation, weg vom Lärm. Parkhäuser, Busse und Bahnen bleiben stehen.
      </HelperNote>
    </HelperCard>
  );
}

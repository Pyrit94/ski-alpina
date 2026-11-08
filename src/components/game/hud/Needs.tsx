import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BedDouble, CableCar, Car, ShoppingBag, Utensils, Wand2, X } from "lucide-react";
import { BY_ID } from "@ski/config";
import { getDem, hexToWorld, itemUnlocked, PENDING_READY, planVillage, siteContext, siteFactors, tickFlow, type ResortState } from "@ski/shared";
import { computeNeeds, NEED_SHORT, type Need, type NeedKey } from "@/lib/game/needs";
import { buildAtBest, pct } from "@/lib/game/placement";
import { fmt } from "@/lib/game/format";
import { play } from "@/lib/game/sound";
import { useGame } from "@/lib/game/store";
import { useMyMoney } from "@/lib/game/team";
import { useStableGame } from "../canvas/use-stable-game";

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
  const busy = useGame((s) => s.autoPistes !== null || s.villageOpen || s.sheet !== "none");
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
    <div className="toast-in pointer-events-auto flex w-[min(94vw,400px)] flex-col gap-1 rounded-[18px] bg-panel/95 p-1 shadow-[var(--shadow-panel)] backdrop-blur-md">
      <div className="flex items-stretch gap-0.5">
        {needs.map((n) => (
          <Meter key={n.key} need={n} active={open === n.key} onClick={() => setOpen(open === n.key ? null : n.key)} />
        ))}
        <button
          type="button"
          onClick={() => useGame.setState({ villageOpen: true })}
          className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] bg-ice px-1 text-[9px] font-bold text-navy"
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
        <button
          type="button"
          onClick={() => buildAtBest(need.itemId!)}
          className="btn-3d flex h-11 shrink-0 items-center gap-1 rounded-full bg-accent px-3 text-[11px] font-bold text-panel"
          style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
        >
          {BY_ID[need.itemId].name} <ArrowRight className="size-3.5" />
        </button>
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
  const open = useGame((s) => s.villageOpen);
  const lifts = useStableGame((s) => s.lifts);
  const pistes = useStableGame((s) => s.pistes);
  const buildings = useStableGame((s) => s.buildings);
  const money = useMyMoney().mine;

  const result = useMemo(() => {
    if (!open) return null;
    const dem = getDem();
    const state = { ...useGame.getState(), lifts, pistes, buildings } as unknown as ResortState;
    const plan = planVillage(state, dem);
    if (plan.moves.length === 0) return { plan, before: null, after: null };
    const to = new Map(plan.moves.map((m) => [m.id, m.to]));
    const moved = { ...state, buildings: state.buildings.map((b) => (to.has(b.id) ? { ...b, ...to.get(b.id)! } : b)) };
    // Twice, as the auto planner does: reputation follows the last tick.
    const run = (s: ResortState) => tickFlow({ ...s, stats: tickFlow(s, dem, 0, PENDING_READY).stats }, dem, 0, PENDING_READY).stats;
    return { plan, before: run(state), after: run(moved) };
  }, [open, lifts, pistes, buildings]);

  useEffect(() => {
    useGame.setState({ villagePreview: result ? result.plan.moves.map((m) => ({ from: m.from, to: m.to })) : [] });
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
  useEffect(() => () => useGame.setState({ villagePreview: [] }), []);

  if (!open || !result) return null;
  const { plan } = result;
  const close = () => useGame.setState({ villageOpen: false });
  const apply = () => {
    useGame.getState().sendPlan([{ type: "rearrange", moves: plan.moves.map((m) => ({ entityId: m.id, q: m.to.q, r: m.to.r })) }]);
    play("build");
    close();
  };
  const tooPoor = plan.cost > money;

  return (
    <div className="toast-in pointer-events-auto w-[min(94vw,360px)] rounded-[20px] bg-panel/95 p-3 shadow-[var(--shadow-panel)] backdrop-blur-md">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-navy">
            <Wand2 className="size-4 text-accent" /> Dorf ordnen
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            Sucht für Restaurants, Läden und Hotels bessere Plätze: an der Piste, nahe der Talstation, weg vom Lärm. Parkhäuser, Busse und Bahnen bleiben stehen.
          </p>
        </div>
        <button type="button" onClick={close} aria-label="Schliessen" className="grid size-11 shrink-0 place-items-center rounded-full bg-ice text-muted">
          <X className="size-4" />
        </button>
      </div>

      {plan.moves.length === 0 ? (
        <p className="mt-2 rounded-[12px] bg-ice px-3 py-2 text-[12px] leading-snug text-navy">
          Alles steht schon an guten Plätzen. Lage im Schnitt {pct(plan.before)}.
        </p>
      ) : (
        <>
          <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
            {plan.moves.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-[12px] bg-ice px-2.5 py-1.5 text-[12px] text-navy">
                <span className="min-w-0 flex-1 truncate font-semibold">{BY_ID[m.itemId].name}</span>
                <span className="shrink-0 text-[10px] text-muted">{Math.max(Math.abs(m.to.q - m.from.q), Math.abs(m.to.r - m.from.r), Math.abs(m.to.q + m.to.r - m.from.q - m.from.r))} Felder</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-center">
            <div className="rounded-[12px] bg-ice px-2 py-1.5">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">Lage im Schnitt</div>
              <div className="text-[12px] font-semibold text-navy">
                {pct(plan.before)} → <span className="text-success">{pct(plan.after)}</span>
              </div>
            </div>
            {result.before && result.after && (
              <div className="rounded-[12px] bg-ice px-2 py-1.5">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">Gewinn/Tag</div>
                <div className="text-[12px] font-semibold text-navy">
                  {fmt(result.before.incomePerHour)} →{" "}
                  <span className={result.after.incomePerHour >= result.before.incomePerHour ? "text-success" : "text-danger"}>
                    {fmt(result.after.incomePerHour)}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={close} className="btn-3d btn-3d-light h-11 shrink-0 rounded-full bg-ice px-4 text-[12px] font-bold text-navy">
              Abbrechen
            </button>
            <button
              type="button"
              disabled={tooPoor}
              onClick={apply}
              className="btn-3d flex h-11 flex-1 items-center justify-center gap-1 rounded-full bg-accent px-3 text-[12px] font-bold text-panel disabled:opacity-50"
              style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
            >
              {tooPoor ? "Zu wenig Geld" : `${plan.moves.length} verschieben · ${fmt(plan.cost)}`}
            </button>
          </div>
          <p className="mt-1 text-center text-[10px] text-muted">Pfeile auf der Karte zeigen, wohin was kommt</p>
        </>
      )}
    </div>
  );
}

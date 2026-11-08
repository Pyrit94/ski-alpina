import { useEffect, useMemo } from "react";
import { Sparkles, Spline } from "lucide-react";
import { FLOW } from "@ski/config";
import { starsFor, type AutoPlan } from "@ski/shared";
import { RatingChip } from "./PisteRating";
import { Calculating } from "./Calculating";
import { HelperButton, HelperCard, HelperFigure, HelperFooter, HelperLink, HelperNote } from "./HelperCard";
import { GRADE_COLOR } from "@/lib/game/piste-editor";
import { fmt } from "@/lib/game/format";
import { play } from "@/lib/game/sound";
import { useGame } from "@/lib/game/store";
import { MIXES, openAutoPistes } from "@/lib/game/auto-pistes";
import { liftNames } from "@/lib/game/assist";
import { helperOf, type HelperOpen } from "@/lib/game/helpers";
import { useMyMoney } from "@/lib/game/team";
import { usePlanner } from "@/lib/game/planner";
import { plannerState } from "@/lib/game/planner-jobs";
import { useStableGame } from "../canvas/use-stable-game";

const GRADE_NAME: Record<string, string> = { blue: "Blaue", red: "Rote", black: "Schwarze" };

/** The button that opens it: a full button in the build menu, a quiet link in a lift's panel. */
export function AutoPistesButton({
  liftId,
  className = "",
  variant = "button",
}: {
  liftId?: string;
  className?: string;
  variant?: "button" | "link";
}) {
  if (variant === "link") {
    return (
      <button
        type="button"
        onClick={() => openAutoPistes(liftId ? [liftId] : null)}
        className={`flex min-h-11 items-center gap-1.5 text-[12px] font-semibold text-accent ${className}`}
      >
        <Sparkles className="size-4" /> Mehr Pisten automatisch planen
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => openAutoPistes(liftId ? [liftId] : null)}
      className={`flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-ice px-4 text-[12px] font-bold text-navy ${className}`}
    >
      <Sparkles className="size-4 text-accent" />
      {liftId ? "Pisten automatisch für diese Bahn" : "Pisten automatisch anlegen"}
    </button>
  );
}

/**
 * «Pisten automatisch»: the runs the chosen lifts are missing — a way down
 * for each, and with «Gemischt» the colours the area does not offer yet —
 * drawn on the map, priced, and built with one tap.
 */
export function AutoPistesPanel() {
  const open = useGame((s) => helperOf(s.helper, "auto"));
  const openHelper = useGame((s) => s.openHelper);
  // Stable across ticks: the plan runs the simulation dozens of times, so it
  // is only worked out again when the layout, the choice or the money changes.
  const lifts = useStableGame((s) => s.lifts);
  const pistes = useStableGame((s) => s.pistes);
  const buildings = useStableGame((s) => s.buildings);
  const research = useStableGame((s) => s.research);
  const ticketPrice = useGame((s) => s.ticketPrice);
  const names = useMemo(() => liftNames(lifts), [lifts]);
  const money = useMyMoney().mine;
  const budget = Math.floor(money / 1000) * 1000;
  const liftIds = open?.liftIds ?? null;
  const mix = open?.mix ?? "mixed";

  // Worked out in the planner worker; the panel stays responsive meanwhile.
  const { result: planned, busy } = usePlanner<"auto">(
    () =>
      open
        ? {
            kind: "auto",
            state: plannerState(useGame.getState(), { lifts, pistes, buildings, research, ticketPrice }),
            opts: { liftIds: liftIds ?? undefined, mix, budget },
          }
        : null,
    // The ids by value: reopening the same choice is the same job.
    [!!open, liftIds?.join(","), mix, lifts, pistes, buildings, research, ticketPrice, budget],
  );
  const result = open ? planned : null;

  useEffect(() => {
    useGame.setState({ autoPreview: result ? result.plans.map((p) => ({ hexes: p.hexes, grade: p.grade })) : [] });
  }, [result]);
  useEffect(() => () => useGame.setState({ autoPreview: [] }), []);

  if (!open) return null;
  const set = (next: Partial<Omit<Extract<HelperOpen, { id: "auto" }>, "id">>) => {
    openHelper({ ...open, ...next });
    if (next.mix) useGame.setState({ pisteMix: next.mix });
  };
  const close = () => openHelper(null);
  const all = liftIds === null;
  const toggle = (id: string) => {
    if (all) return set({ liftIds: [id] });
    const ids = liftIds.includes(id) ? liftIds.filter((x) => x !== id) : [...liftIds, id];
    set({ liftIds: ids.length === 0 || ids.length === lifts.length ? null : ids });
  };
  const plans = result?.plans ?? [];
  const total = plans.reduce((n, p) => n + p.cost, 0);
  const km = plans.reduce((n, p) => n + (p.hexes.length - 1) * FLOW.kmPerSegment, 0);
  const terrain = result?.missed.filter((m) => m.reason === "terrain").length ?? 0;
  const poor = result?.missed.filter((m) => m.reason === "budget").length ?? 0;
  const build = () => {
    if (!result || busy) return;
    useGame.getState().sendPlan(result.plans.map((p) => ({ type: "place_piste" as const, itemId: "piste" as const, hexes: p.hexes })));
    play("build");
    close();
  };
  const hasRuns = pistes.some((p) => p.itemId === "piste");

  return (
    <HelperCard
      icon={Sparkles}
      title="Pisten automatisch"
      subtitle="Erst fehlende Abfahrten, dann Gewinn"
      onClose={close}
      busy={busy && !!result}
      footer={
        lifts.length > 0 && result ? (
          <HelperFooter summary={plans.length > 0 ? `${km.toFixed(1)} km neu, gestrichelt auf der Karte` : undefined}>
            <HelperButton variant="secondary" onClick={close}>
              Abbrechen
            </HelperButton>
            <HelperButton grow disabled={busy || plans.length === 0} onClick={build}>
              {plans.length === 0 ? "Nichts anzulegen" : `${plans.length} ${plans.length === 1 ? "Piste" : "Pisten"} anlegen · ${fmt(total)}`}
            </HelperButton>
          </HelperFooter>
        ) : undefined
      }
    >
      {lifts.length === 0 ? (
        <HelperNote>Baue zuerst eine Bahn: Pisten führen von Bergstationen hinunter.</HelperNote>
      ) : (
        <>
          <div className="-mx-3 flex gap-1 overflow-x-auto px-3">
            <Chip active={all} onClick={() => set({ liftIds: null })}>
              Ganzes Gebiet
            </Chip>
            {lifts.map((l) => (
              <Chip key={l.id} active={!all && liftIds.includes(l.id)} onClick={() => toggle(l.id)}>
                {names.get(l.id)}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-0.5 rounded-full bg-ice p-0.5">
            {MIXES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mix === m.id}
                onClick={() => set({ mix: m.id })}
                className={`min-h-11 rounded-full text-[11px] font-semibold ${mix === m.id ? "bg-accent text-panel" : "text-navy"}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {!result ? (
            <Calculating className="" />
          ) : (
            <>
              {plans.length === 0 ? (
                <HelperNote>
                  {poor > 0
                    ? "Für die fehlenden Abfahrten reicht das Geld noch nicht."
                    : terrain > 0
                      ? "Von diesen Bergstationen führt kein befahrbarer Hang hinunter. Verschiebe die Bahn oder zeichne selbst."
                      : "Keine Piste würde sich hier gerade lohnen."}
                </HelperNote>
              ) : (
                <ul className="flex flex-col gap-1">
                  {plans.map((p, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-[12px] bg-ice px-2.5 py-1.5 text-[12px] text-navy">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: GRADE_COLOR[p.grade as keyof typeof GRADE_COLOR] ?? "#888" }} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 truncate font-semibold">{planTitle(p, names.get(p.liftId) ?? "")}</span>
                          <RatingChip points={p.points} stars={starsFor(p.points)} />
                        </span>
                        <span className="block truncate text-[10px] text-muted">
                          {((p.hexes.length - 1) * FLOW.kmPerSegment).toFixed(1)} km
                          {p.gainGuests > 0 ? ` · +${fmt(p.gainGuests)} Gäste/h` : ""}
                          {p.gainIncome !== 0 ? ` · ${p.gainIncome > 0 ? "+" : "−"}${fmt(Math.abs(p.gainIncome))}/Tag` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold text-coin">{fmt(p.cost)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {plans.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5">
                  <Outlook label="Gäste/h" from={result.before.guestsPerHour} to={result.after.guestsPerHour} />
                  <Outlook label="Gewinn/Tag" from={result.before.incomePerHour} to={result.after.incomePerHour} signed />
                </div>
              )}
              {(terrain > 0 || poor > 0) && plans.length > 0 && (
                <p className="text-[11px] leading-snug text-warn">
                  {terrain > 0 && `${terrain} ${terrain === 1 ? "Bahn hat" : "Bahnen haben"} keinen befahrbaren Hang. `}
                  {poor > 0 && `${poor} ${poor === 1 ? "Abfahrt" : "Abfahrten"} später, das Geld reicht noch nicht.`}
                </p>
              )}
              {result.limit !== "none" && (
                <HelperNote tone="warn">
                  {result.limit === "doors"
                    ? "Engpass sind die Ankünfte: Mehr Pisten bringen erst etwas, wenn mehr Gäste ankommen. Parkhaus, Bus oder Hotel ausbauen."
                    : `Engpass ist jetzt ${result.limitLabel || "eine Bahn"}: Kapazität ausbauen bringt mehr als eine weitere Piste.`}
                </HelperNote>
              )}
            </>
          )}
          <HelperNote tone="muted">
            Rechnet jede mögliche Piste durch, auch geschwungene Linien. Schöne Pisten geben Punkte.
          </HelperNote>
          {hasRuns && (
            <HelperLink icon={Spline} onClick={() => openHelper({ id: "reshape" })}>
              Bestehende Pisten verbessern
            </HelperLink>
          )}
        </>
      )}
    </HelperCard>
  );
}

function planTitle(p: AutoPlan, lift: string): string {
  if (p.why === "descent") return `Abfahrt ${lift}`;
  if (p.why === "relief") return `Entlastet ${lift}`;
  return `${GRADE_NAME[p.grade] ?? "Neue"} Piste ab ${lift}`;
}

function Outlook({ label, from, to, signed = false }: { label: string; from: number; to: number; signed?: boolean }) {
  const show = (n: number) => (signed && n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(Math.round(n)));
  return (
    <HelperFigure label={label}>
      {show(from)} → <span className={to >= from ? "text-success" : "text-danger"}>{show(to)}</span>
    </HelperFigure>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 shrink-0 whitespace-nowrap rounded-full px-3 text-[11px] font-semibold ${active ? "bg-navy text-panel" : "bg-ice text-navy"}`}
    >
      {children}
    </button>
  );
}

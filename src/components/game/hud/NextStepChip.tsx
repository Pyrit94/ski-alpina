import { ArrowRight, Lightbulb, Wrench, X } from "lucide-react";
import { useMemo, useState } from "react";
import { itemUnlocked } from "@ski/shared";
import { useResortLinks } from "@/lib/game/links";
import { nextStep } from "@/lib/game/next-step";
import { runStepAction } from "@/lib/game/step-actions";
import { useGame } from "@/lib/game/store";

/** Tips dismissed this session, by id: one stays away until the situation changes. */
const dismissed = new Set<string>();

/**
 * The single most useful next move, as a chip with its button. Hidden while
 * building, while the tutorial is talking, and once dismissed.
 */
export function NextStepChip({ className = "" }: { className?: string }) {
  const lifts = useGame((s) => s.lifts);
  const pistes = useGame((s) => s.pistes);
  const buildings = useGame((s) => s.buildings);
  const stats = useGame((s) => s.stats);
  const flow = useGame((s) => s.flow);
  const coins = useGame((s) => s.coins);
  const phase = useGame((s) => s.phase);
  const tutorialOpen = useGame((s) => s.tutorialOpen);
  const selectedId = useGame((s) => s.selectedId);
  const descentOffer = useGame((s) => s.descentOffer);
  const links = useResortLinks();
  const [, setTick] = useState(0);

  const step = useMemo(
    () =>
      nextStep({
        lifts,
        pistes,
        buildings,
        stats,
        flow,
        links,
        coins,
        unlocked: (id) => itemUnlocked(useGame.getState(), id),
      }),
    [lifts, pistes, buildings, stats, flow, links, coins],
  );
  if (!step || phase !== "idle" || tutorialOpen || selectedId || dismissed.has(step.id)) return null;
  // A lift built a moment ago already has its own offer card for the descent.
  if (step.action?.kind === "descent" && step.action.liftId === descentOffer) return null;
  const Icon = step.tone === "fix" ? Wrench : Lightbulb;
  return (
    <div
      className={`toast-in pointer-events-auto flex w-[min(94vw,440px)] items-center gap-2 rounded-[18px] bg-panel/95 p-2 pl-3 shadow-[var(--shadow-panel)] backdrop-blur-md ${className}`}
    >
      <Icon className={`size-4 shrink-0 ${step.tone === "fix" ? "text-warn" : "text-accent"}`} />
      <p className="min-w-0 flex-1 text-[12px] leading-snug text-navy">{step.text}</p>
      {step.action && (
        <button
          type="button"
          onClick={() => runStepAction(step.action!)}
          className="btn-3d flex h-11 shrink-0 items-center gap-1 rounded-full bg-accent px-3 text-[12px] font-bold text-panel"
          style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
        >
          {step.actionLabel} <ArrowRight className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          dismissed.add(step.id);
          setTick((n) => n + 1);
        }}
        aria-label="Tipp ausblenden"
        className="grid size-11 shrink-0 place-items-center rounded-full text-muted"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

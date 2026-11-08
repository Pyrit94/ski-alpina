import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import type { Reshape } from "@ski/shared";
import { fmt } from "@/lib/game/format";
import { usePlanner } from "@/lib/game/planner";
import { plannerState } from "@/lib/game/planner-jobs";
import { play } from "@/lib/game/sound";
import { useGame } from "@/lib/game/store";
import { useStableGame } from "../canvas/use-stable-game";
import { Calculating } from "./Calculating";

/** Show proposed lines on the map, dashed, the way the auto planner does. */
function preview(list: readonly Reshape[]) {
  useGame.setState({ autoPreview: list.map((r) => ({ hexes: r.hexes, grade: useGame.getState().pistes.find((p) => p.id === r.pisteId)?.difficulty ?? "blue" })) });
}

/**
 * «Piste verbessern» in a run's panel: looks for a line with more swings and
 * variety between the same two ends, shows it dashed, and lays it on a tap.
 */
export function ReshapeOne({ pisteId }: { pisteId: string }) {
  // Looked for once per tap, in the planner worker.
  const [asked, setAsked] = useState(false);
  const { result } = usePlanner<"reshapeOne">(
    () => (asked ? { kind: "reshapeOne", state: plannerState(useGame.getState()), pisteId } : null),
    [asked, pisteId],
  );
  const answer = asked ? result : null;
  useEffect(() => {
    if (answer) preview(answer.found ? [answer.found] : []);
  }, [answer]);
  useEffect(() => () => useGame.setState({ autoPreview: [] }), []);
  const look = () => setAsked(true);
  if (!asked) {
    return (
      <button
        type="button"
        onClick={look}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-ice text-[12px] font-semibold text-navy"
      >
        <Wand2 className="size-4 text-accent" /> Piste verbessern
      </button>
    );
  }
  if (!answer) return <Calculating />;
  const found = answer.found;
  if (!found) {
    return <p className="mt-2 rounded-[12px] bg-ice px-3 py-2 text-[12px] text-navy">Zwischen diesen Endpunkten gibt es keine deutlich bessere Linie.</p>;
  }
  return (
    <div className="mt-2 rounded-[14px] bg-ice p-2.5 text-[12px] text-navy">
      <div className="font-semibold">
        Schwungvollere Linie: {found.before} → <span className="text-success">{found.after} Punkte</span>
      </div>
      <div className="text-[11px] text-muted">Gestrichelt auf der Karte. Start und Ziel bleiben.</div>
      <button
        type="button"
        onClick={() => {
          useGame.getState().sendPlan([{ type: "reshape_piste", pisteId, hexes: found.hexes }]);
          play("build");
          setAsked(false);
          useGame.setState({ autoPreview: [] });
        }}
        className="btn-3d mt-2 flex h-11 w-full items-center justify-center rounded-full bg-accent text-[12px] font-bold text-panel"
        style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
      >
        Neu präparieren · {fmt(found.cost)}
      </button>
    </div>
  );
}

/** In «Pisten automatisch»: every run that a better line would clearly improve, in one go. */
export function ReshapeAll() {
  // Stable across snapshots that change nothing, so a result is not thrown away every tick.
  const pistes = useStableGame((s) => s.pistes);
  // A result belongs to the runs it was worked out for; any change asks again.
  const [askedFor, setAskedFor] = useState<typeof pistes | null>(null);
  const asked = askedFor !== null && askedFor === pistes;
  const { result } = usePlanner<"reshapeAll">(
    () => (asked ? { kind: "reshapeAll", state: plannerState(useGame.getState(), { pistes }) } : null),
    [asked, pistes],
  );
  const list = asked ? result : null;
  useEffect(() => {
    if (list) preview(list);
  }, [list]);
  if (pistes.filter((p) => p.itemId === "piste").length === 0) return null;
  if (asked && !list) return <Calculating />;
  if (!list) {
    return (
      <button
        type="button"
        onClick={() => setAskedFor(pistes)}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-ice text-[12px] font-semibold text-navy"
      >
        <Wand2 className="size-4 text-accent" /> Bestehende Pisten verbessern
      </button>
    );
  }
  if (list.length === 0) {
    return <p className="mt-2 rounded-[12px] bg-ice px-3 py-2 text-[12px] text-navy">Eure Pisten sind schon gut gelegt.</p>;
  }
  const cost = list.reduce((n, r) => n + r.cost, 0);
  const gain = list.reduce((n, r) => n + r.after - r.before, 0);
  return (
    <div className="mt-2 rounded-[14px] bg-ice p-2.5 text-[12px] text-navy">
      <div className="font-semibold">
        {list.length} {list.length === 1 ? "Piste" : "Pisten"} schwungvoller: <span className="text-success">+{gain} Punkte</span>
      </div>
      <button
        type="button"
        onClick={() => {
          useGame.getState().sendPlan(
            list.map((r) => ({ type: "reshape_piste" as const, pisteId: r.pisteId, hexes: r.hexes })),
            `${list.length} Pisten verbessern`,
          );
          play("build");
          setAskedFor(null);
          useGame.setState({ autoPreview: [] });
        }}
        className="btn-3d mt-2 flex h-11 w-full items-center justify-center rounded-full bg-accent text-[12px] font-bold text-panel"
        style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
      >
        Alle neu präparieren · {fmt(cost)}
      </button>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Spline, Wand2 } from "lucide-react";
import { starsFor, type Reshape } from "@ski/shared";
import { fmt } from "@/lib/game/format";
import { GRADE_COLOR } from "@/lib/game/piste-editor";
import { usePlanner } from "@/lib/game/planner";
import { plannerState } from "@/lib/game/planner-jobs";
import { play } from "@/lib/game/sound";
import { useGame } from "@/lib/game/store";
import { useStableGame } from "../canvas/use-stable-game";
import { Calculating } from "./Calculating";
import { HelperButton, HelperCard, HelperFooter, HelperNote } from "./HelperCard";
import { RatingChip } from "./PisteRating";

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

/**
 * «Pisten optimieren»: every run that a better line between the same two
 * ends would clearly improve, worked out as the card opens, shown dashed and
 * laid in one go.
 */
export function ReshapePanel() {
  const open = useGame((s) => s.helper?.id === "reshape");
  const openHelper = useGame((s) => s.openHelper);
  // Stable across snapshots that change nothing, so a result is not thrown away every tick.
  const pistes = useStableGame((s) => s.pistes);
  const runs = pistes.filter((p) => p.itemId === "piste");
  const any = runs.length > 0;
  const { result, busy } = usePlanner<"reshapeAll">(
    () => (open && any ? { kind: "reshapeAll", state: plannerState(useGame.getState(), { pistes }) } : null),
    [open, any, pistes],
  );
  const list = open ? result : null;
  useEffect(() => {
    if (list) preview(list);
  }, [list]);
  useEffect(() => () => useGame.setState({ autoPreview: [] }), []);
  if (!open) return null;

  const close = () => openHelper(null);
  const cost = list?.reduce((n, r) => n + r.cost, 0) ?? 0;
  const gain = list?.reduce((n, r) => n + r.after - r.before, 0) ?? 0;
  const apply = () => {
    if (!list || list.length === 0 || busy) return;
    useGame.getState().sendPlan(
      list.map((r) => ({ type: "reshape_piste" as const, pisteId: r.pisteId, hexes: r.hexes })),
      `${list.length} Pisten verbessern`,
    );
    play("build");
    close();
  };
  const nameOf = (id: string) => {
    const i = runs.findIndex((p) => p.id === id);
    return runs[i]?.name || `Piste ${i + 1}`;
  };

  return (
    <HelperCard
      icon={Spline}
      title="Pisten optimieren"
      subtitle="Mehr Schwünge, gleiche Start- und Zielpunkte"
      onClose={close}
      busy={busy && !!list}
      footer={
        list && list.length > 0 ? (
          <HelperFooter summary="Die neuen Linien sind auf der Karte gestrichelt">
            <HelperButton variant="secondary" onClick={close}>
              Abbrechen
            </HelperButton>
            <HelperButton grow disabled={busy} onClick={apply}>
              Alle neu präparieren · {fmt(cost)}
            </HelperButton>
          </HelperFooter>
        ) : undefined
      }
    >
      {!any ? (
        <HelperNote>Noch keine Pisten. Erst bauen, dann verbessern.</HelperNote>
      ) : !list ? (
        <Calculating className="" />
      ) : list.length === 0 ? (
        <HelperNote>Eure Pisten sind schon gut gelegt.</HelperNote>
      ) : (
        <>
          <HelperNote>
            {list.length} {list.length === 1 ? "Piste" : "Pisten"} schwungvoller: <span className="font-bold text-success">+{gain} Punkte</span>
          </HelperNote>
          <ul className="flex flex-col gap-1">
            {list.map((r) => {
              const p = runs.find((x) => x.id === r.pisteId);
              return (
                <li key={r.pisteId} className="flex items-center gap-2 rounded-[12px] bg-ice px-2.5 py-1.5 text-[12px] text-navy">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: GRADE_COLOR[(p?.difficulty ?? "blue") as keyof typeof GRADE_COLOR] ?? "#888" }}
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold">{nameOf(r.pisteId)}</span>
                  <span className="value shrink-0 text-[11px] text-muted">{r.before} →</span>
                  <RatingChip points={r.after} stars={starsFor(r.after)} />
                  <span className="shrink-0 text-[11px] font-semibold text-coin">{fmt(r.cost)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <HelperNote tone="muted">Schöne Pisten geben Punkte: Gefälle, Länge, Schwünge und Abwechslung.</HelperNote>
    </HelperCard>
  );
}


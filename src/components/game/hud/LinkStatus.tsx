import { useEffect, useRef } from "react";
import { CircleCheck, CircleAlert, Route, X } from "lucide-react";
import { BY_ID } from "@ski/config";
import { hexToWorld } from "@ski/shared";
import { LIFT_LINK_TEXT, PISTE_LINK_TEXT, proposeDescent, useResortLinks } from "@/lib/game/links";
import { useGame } from "@/lib/game/store";

/** The «Abfahrt anlegen» button: one tap opens the run, drawn and priced. */
export function DescentButton({ liftId, className = "" }: { liftId: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => proposeDescent(liftId)}
      className={`btn-3d flex h-11 items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-bold text-panel ${className}`}
      style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
    >
      <Route className="size-4" /> Abfahrt anlegen
    </button>
  );
}

/**
 * Whether a lift or run is joined, as a chip and one sentence — and for a
 * lift with no way down, the button that builds one.
 */
export function LinkStatus({ id, kind }: { id: string; kind: "lift" | "piste" }) {
  const links = useResortLinks();
  const link = links.get(id);
  if (!link) return null;
  const text =
    kind === "lift"
      ? LIFT_LINK_TEXT[link as keyof typeof LIFT_LINK_TEXT]
      : PISTE_LINK_TEXT[link as keyof typeof PISTE_LINK_TEXT];
  if (!text) return null;
  const ok = link === "ok";
  return (
    <div className="mt-2">
      <div
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${ok ? "bg-success/15 text-success" : "bg-warn/15 text-warn"}`}
      >
        {ok ? <CircleCheck className="size-3.5" /> : <CircleAlert className="size-3.5" />}
        {text.chip}
      </div>
      {!ok && <p className="mt-1 text-[11px] leading-snug text-muted">{text.why}</p>}
      {kind === "lift" && link === "no-descent" && (
        <DescentButton liftId={id} className="mt-2 w-full" />
      )}
    </div>
  );
}

/**
 * Right after you build a lift: if nothing leads down from it yet, offer the
 * run in one tap instead of leaving you to find out from an empty lift.
 */
export function DescentOffer() {
  const lifts = useGame((s) => s.lifts);
  const me = useGame((s) => s.playerId);
  const phase = useGame((s) => s.phase);
  const selectedId = useGame((s) => s.selectedId);
  const links = useResortLinks();
  const known = useRef<Set<string> | null>(null);
  const offer = useGame((s) => s.descentOffer);
  const autoOpen = useGame((s) => s.autoPistes !== null);
  const setOffer = (id: string | null) => useGame.setState({ descentOffer: id });

  useEffect(() => {
    const ids = new Set(lifts.map((l) => l.id));
    if (known.current) {
      const added = lifts.filter((l) => !known.current!.has(l.id));
      // One new lift is one you just built; a batch is a snapshot loading.
      const fresh = added.length === 1 ? added[0]! : null;
      if (fresh && (!fresh.builtBy || fresh.builtBy === me)) {
        setOffer(fresh.id);
        // Show what was just built: the camera glides to the new line.
        const a = hexToWorld(fresh.a.q, fresh.a.r);
        const b = hexToWorld(fresh.b.q, fresh.b.r);
        useGame.getState().focusOn((a.x + b.x) / 2, (a.z + b.z) / 2);
      }
    }
    known.current = ids;
  }, [lifts, me]);

  const lift = lifts.find((l) => l.id === offer);
  if (!lift || autoOpen || phase === "piste" || links.get(lift.id) !== "no-descent") return null;
  // Selected, its own panel already carries the button: one is enough.
  if (selectedId && [lift.id, lift.stationA, lift.stationB].includes(selectedId)) return null;
  const name = BY_ID[lift.itemId].name;
  return (
    <div className="toast-in pointer-events-auto w-[min(94vw,340px)] rounded-[20px] bg-panel/95 p-3 shadow-[var(--shadow-panel)] backdrop-blur-md">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-navy">
            {name} steht – noch keine Abfahrt
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            Lift rauf, Piste runter: Wir schlagen dir die Abfahrt bis zur nächsten Talstation, ins
            Dorf oder auf eine Piste vor.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOffer(null)}
          aria-label="Später"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ice text-muted"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => setOffer(null)}
          className="btn-3d btn-3d-light h-11 shrink-0 rounded-full bg-ice px-4 text-[12px] font-bold text-navy"
        >
          Später
        </button>
        <DescentButton liftId={lift.id} className="flex-1" />
      </div>
    </div>
  );
}

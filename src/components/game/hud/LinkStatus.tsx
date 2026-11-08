import { useEffect, useRef } from "react";
import { CircleCheck, CircleAlert, Route } from "lucide-react";
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
 * Right after you build a lift, the camera glides to it. The run it still
 * needs is offered by the advisor chip (NextStepChip), not by a card of its
 * own: one voice for what to do next.
 */
export function DescentOffer() {
  const lifts = useGame((s) => s.lifts);
  const me = useGame((s) => s.playerId);
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    const ids = new Set(lifts.map((l) => l.id));
    if (known.current) {
      const added = lifts.filter((l) => !known.current!.has(l.id));
      // One new lift is one you just built; a batch is a snapshot loading.
      const fresh = added.length === 1 ? added[0]! : null;
      if (fresh && (!fresh.builtBy || fresh.builtBy === me)) {
        useGame.setState({ descentOffer: fresh.id });
        const a = hexToWorld(fresh.a.q, fresh.a.r);
        const b = hexToWorld(fresh.b.q, fresh.b.r);
        useGame.getState().focusOn((a.x + b.x) / 2, (a.z + b.z) / 2);
      }
    }
    known.current = ids;
  }, [lifts, me]);
  return null;
}

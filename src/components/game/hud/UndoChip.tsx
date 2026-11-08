import { useEffect, useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import { ECONOMY } from "@ski/config";
import { BY_ID, isLift } from "@/lib/game/catalog";
import { useGame } from "@/lib/game/store";

/**
 * «Rückgängig» for your last build, for as long as it is free: a mis-tap on
 * a phone costs nothing. Counts down and disappears on its own.
 */
export function UndoChip() {
  const me = useGame((s) => s.playerId);
  const buildings = useGame((s) => s.buildings);
  const lifts = useGame((s) => s.lifts);
  const pistes = useGame((s) => s.pistes);
  const undo = useGame((s) => s.undo);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const last = useMemo(() => {
    const mine = [
      ...lifts.map((l) => ({ id: l.id, name: l.name ?? BY_ID[l.itemId].name, builtAt: l.builtAt, builtBy: l.builtBy })),
      ...buildings
        .filter((b) => !isLift(b.itemId))
        .map((b) => ({ id: b.id, name: BY_ID[b.itemId].name, builtAt: b.builtAt, builtBy: b.builtBy })),
      ...pistes.map((p) => ({ id: p.id, name: p.name ?? BY_ID[p.itemId].name, builtAt: p.builtAt, builtBy: p.builtBy })),
    ].filter((e) => !e.builtBy || e.builtBy === me);
    return mine.sort((a, b) => b.builtAt - a.builtAt)[0] ?? null;
  }, [buildings, lifts, pistes, me]);
  const left = last ? Math.ceil((last.builtAt + ECONOMY.undoSeconds * 1000 - now) / 1000) : 0;
  if (!last || left <= 0 || left > ECONOMY.undoSeconds) return null;
  return (
    <button
      type="button"
      onClick={() => undo(last.id)}
      className="toast-in pointer-events-auto flex min-h-11 items-center gap-2 rounded-full bg-navy/90 px-4 text-[13px] font-semibold text-panel shadow-[var(--shadow-panel)]"
    >
      <Undo2 className="size-4" />
      <span className="max-w-[12rem] truncate">{last.name} rückgängig</span>
      <span className="value text-[11px] opacity-75">{left}s</span>
    </button>
  );
}

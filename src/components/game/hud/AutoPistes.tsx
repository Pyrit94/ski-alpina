import { useEffect, useMemo } from "react";
import { Sparkles, X } from "lucide-react";
import { BY_ID, FLOW } from "@ski/config";
import { getDem, planAutoPistes, type AutoMix } from "@ski/shared";
import { GRADE_COLOR } from "@/lib/game/piste-editor";
import { fmt } from "@/lib/game/format";
import { play } from "@/lib/game/sound";
import { useGame } from "@/lib/game/store";
import { openAutoPistes } from "@/lib/game/auto-pistes";
import { useMyMoney } from "@/lib/game/team";

const MIXES: { id: AutoMix; label: string }[] = [
  { id: "mixed", label: "Gemischt" },
  { id: "blue", label: "Blau" },
  { id: "red", label: "Rot" },
  { id: "black", label: "Schwarz" },
];

const GRADE_NAME: Record<string, string> = { blue: "Blaue", red: "Rote", black: "Schwarze" };

/** The button that opens it, for the build menu and a lift's panel. */
export function AutoPistesButton({ liftId, className = "" }: { liftId?: string; className?: string }) {
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

/** Lift names that tell two chairlifts apart. */
function useLiftNames(): Map<string, string> {
  const lifts = useGame((s) => s.lifts);
  return useMemo(() => {
    const seen = new Map<string, number>();
    const total = new Map<string, number>();
    for (const l of lifts) total.set(l.itemId, (total.get(l.itemId) ?? 0) + 1);
    const out = new Map<string, string>();
    for (const l of lifts) {
      const n = (seen.get(l.itemId) ?? 0) + 1;
      seen.set(l.itemId, n);
      const name = BY_ID[l.itemId].name;
      out.set(l.id, (total.get(l.itemId) ?? 0) > 1 ? `${name} ${n}` : name);
    }
    return out;
  }, [lifts]);
}

/**
 * «Pisten automatisch»: the runs the chosen lifts are missing — a way down
 * for each, and with «Gemischt» the colours the area does not offer yet —
 * drawn on the map, priced, and built with one tap.
 */
export function AutoPistesPanel() {
  const open = useGame((s) => s.autoPistes);
  const lifts = useGame((s) => s.lifts);
  const pistes = useGame((s) => s.pistes);
  const buildings = useGame((s) => s.buildings);
  const research = useGame((s) => s.research);
  const match = useGame((s) => s.match);
  const sendIntent = useGame((s) => s.sendIntent);
  const names = useLiftNames();
  const money = useMyMoney().mine;

  const result = useMemo(() => {
    if (!open) return null;
    const state = { ...useGame.getState(), lifts, pistes, buildings, research, match };
    return planAutoPistes(state, getDem(), { liftIds: open.liftIds ?? undefined, mix: open.mix, budget: money });
  }, [open, lifts, pistes, buildings, research, match, money]);

  useEffect(() => {
    useGame.setState({ autoPreview: result ? result.plans.map((p) => ({ hexes: p.hexes, grade: p.grade })) : [] });
  }, [result]);
  useEffect(() => () => useGame.setState({ autoPreview: [] }), []);

  if (!open || !result) return null;
  const set = (next: Partial<NonNullable<typeof open>>) => useGame.setState({ autoPistes: { ...open, ...next } });
  const close = () => useGame.setState({ autoPistes: null });
  const all = open.liftIds === null;
  const toggle = (id: string) => {
    if (all) return set({ liftIds: [id] });
    const ids = open.liftIds!.includes(id) ? open.liftIds!.filter((x) => x !== id) : [...open.liftIds!, id];
    set({ liftIds: ids.length === 0 || ids.length === lifts.length ? null : ids });
  };
  const total = result.plans.reduce((n, p) => n + p.cost, 0);
  const km = result.plans.reduce((n, p) => n + (p.hexes.length - 1) * FLOW.kmPerSegment, 0);
  const terrain = result.missed.filter((m) => m.reason === "terrain").length;
  const budget = result.missed.filter((m) => m.reason === "budget").length;
  const build = () => {
    for (const p of result.plans) sendIntent({ type: "place_piste", itemId: "piste", hexes: p.hexes });
    play("build");
    close();
  };

  return (
    <div className="toast-in pointer-events-auto w-[min(94vw,360px)] rounded-[20px] bg-panel/95 p-3 shadow-[var(--shadow-panel)] backdrop-blur-md">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-navy">
            <Sparkles className="size-4 text-accent" /> Pisten automatisch
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            Jede Bahn bekommt eine Abfahrt. «Gemischt» ergänzt die Farben, die noch fehlen.
          </p>
        </div>
        <button type="button" onClick={close} aria-label="Schliessen" className="grid size-11 shrink-0 place-items-center rounded-full bg-ice text-muted">
          <X className="size-4" />
        </button>
      </div>

      {lifts.length === 0 ? (
        <p className="mt-2 rounded-[12px] bg-ice px-3 py-2 text-[12px] text-navy">Baue zuerst eine Bahn: Pisten führen von Bergstationen hinunter.</p>
      ) : (
        <>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
            <Chip active={all} onClick={() => set({ liftIds: null })}>
              Ganzes Gebiet
            </Chip>
            {lifts.map((l) => (
              <Chip key={l.id} active={!all && open.liftIds!.includes(l.id)} onClick={() => toggle(l.id)}>
                {names.get(l.id)}
              </Chip>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-4 gap-1 rounded-full bg-ice p-1">
            {MIXES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => set({ mix: m.id })}
                className={`min-h-9 rounded-full text-[11px] font-semibold ${open.mix === m.id ? "bg-accent text-panel" : "text-navy"}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {result.plans.length === 0 ? (
            <p className="mt-2 rounded-[12px] bg-ice px-3 py-2 text-[12px] leading-snug text-navy">
              {budget > 0
                ? "Für die fehlenden Abfahrten reicht das Geld noch nicht."
                : terrain > 0
                  ? "Von diesen Bergstationen führt kein befahrbarer Hang hinunter. Verschiebe die Bahn oder zeichne selbst."
                  : "Alles da: Jede gewählte Bahn hat eine Abfahrt, und es fehlt keine Farbe."}
            </p>
          ) : (
            <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
              {result.plans.map((p, i) => (
                <li key={i} className="flex items-center gap-2 rounded-[12px] bg-ice px-2.5 py-1.5 text-[12px] text-navy">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: GRADE_COLOR[p.grade as keyof typeof GRADE_COLOR] ?? "#888" }} />
                  <span className="min-w-0 flex-1 truncate">
                    {p.why === "descent" ? `Abfahrt ${names.get(p.liftId) ?? ""}` : `${GRADE_NAME[p.grade] ?? "Neue"} Piste ab ${names.get(p.liftId) ?? ""}`}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{((p.hexes.length - 1) * FLOW.kmPerSegment).toFixed(1)} km</span>
                  <span className="shrink-0 text-[11px] font-semibold text-coin">{fmt(p.cost)}</span>
                </li>
              ))}
            </ul>
          )}
          {result.plans.length > 0 && (terrain > 0 || budget > 0) && (
            <p className="mt-1.5 text-[11px] leading-snug text-warn">
              {terrain > 0 && `${terrain} ${terrain === 1 ? "Bahn hat" : "Bahnen haben"} keinen befahrbaren Hang. `}
              {budget > 0 && `${budget} ${budget === 1 ? "Abfahrt" : "Abfahrten"} später, das Geld reicht noch nicht.`}
            </p>
          )}
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={close} className="btn-3d btn-3d-light h-11 shrink-0 rounded-full bg-ice px-4 text-[12px] font-bold text-navy">
              Abbrechen
            </button>
            <button
              type="button"
              disabled={result.plans.length === 0}
              onClick={build}
              className="btn-3d flex h-11 flex-1 items-center justify-center gap-1 rounded-full bg-accent px-3 text-[12px] font-bold text-panel disabled:opacity-50"
              style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
            >
              {result.plans.length === 0
                ? "Nichts anzulegen"
                : `${result.plans.length} ${result.plans.length === 1 ? "Piste" : "Pisten"} anlegen · ${fmt(total)}`}
            </button>
          </div>
          {result.plans.length > 0 && <p className="mt-1 text-center text-[10px] text-muted">{km.toFixed(1)} km neu, gestrichelt auf der Karte</p>}
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-[11px] font-semibold ${active ? "bg-navy text-panel" : "bg-ice text-navy"}`}
    >
      {children}
    </button>
  );
}

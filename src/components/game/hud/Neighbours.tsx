import { CableCar, Mountain, Users, X } from "lucide-react";
import { FLOW, NEIGHBOURS } from "@ski/config";
import { neighbourKm, neighboursOn, type Neighbour } from "@ski/shared";
import { showNeighbour } from "@/lib/game/neighbours";
import { fmtCompact } from "@/lib/game/format";
import { useGame } from "@/lib/game/store";
import { useStableGame } from "../canvas/use-stable-game";

const km = (n: Neighbour) => n.pistes.reduce((sum, p) => sum + Math.max(1, p.hexes.length - 1) * FLOW.kmPerSegment, 0);
const pct = (v: number) => `${Math.round(v * 100)} %`;

/**
 * A neighbour ski area's card: who they are, how big, how busy, and what
 * they take from you. Opens on a tap on their lifts, stations or name.
 */
export function NeighbourCard() {
  const open = useGame((s) => s.neighbourOpen);
  const list = useStableGame((s) => neighboursOn(s));
  const cut = useGame((s) => s.stats.neighbourCut ?? 0);
  const n = list.find((x) => x.id === open);
  if (!n) return null;
  const theirs = neighbourKm(n);
  const all = list.reduce((sum, x) => sum + neighbourKm(x), 0) || 1;
  const close = () => useGame.setState({ neighbourOpen: null });
  return (
    <div className="toast-in pointer-events-auto w-[min(94vw,360px)] rounded-[20px] bg-panel/95 p-3 shadow-[var(--shadow-panel)] backdrop-blur-md">
      <div className="flex items-start gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ice text-muted">
          <Mountain className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-navy">{n.name}</div>
          <div className="text-[11px] text-muted">Nachbar-Skigebiet</div>
        </div>
        <button type="button" onClick={close} aria-label="Schliessen" className="grid size-11 shrink-0 place-items-center rounded-full bg-ice text-muted">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <Figure label="Bahnen" value={String(n.lifts.length)} />
        <Figure label="Pisten" value={`${km(n).toFixed(1)} km`} />
        <Figure label="Gäste/Tag" value={n.guestsYesterday > 0 ? fmtCompact(n.guestsYesterday) : "neu"} />
      </div>
      <p className="mt-2 rounded-[12px] bg-ice px-2.5 py-1.5 text-[11px] leading-snug text-navy">
        Teilt sich die Gäste der Gegend mit euch: Es fehlen euch gerade <span className="font-bold">{pct(cut * (theirs / all))}</span> der
        Gäste. Je grösser euer Gebiet, desto mehr bleiben bei euch.
      </p>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-ice px-1.5 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="value text-[13px] font-bold text-navy">{value}</div>
    </div>
  );
}

/** «Nachbarn» in Betrieb: every neighbour area, one tap to fly there. */
export function NeighboursPanel() {
  const list = useStableGame((s) => neighboursOn(s));
  const cut = useGame((s) => s.stats.neighbourCut ?? 0);
  if (list.length === 0) return null;
  return (
    <section className="rounded-[18px] bg-snow p-2.5 ring-1 ring-line">
      <div className="flex items-center justify-between px-1">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-navy">
          <Users className="size-4 text-muted" /> Nachbarn
        </h3>
        <span className="text-[11px] text-muted">
          nehmen euch <span className="value font-semibold text-navy">{pct(cut)}</span> der Gäste
        </span>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1">
        {list.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => showNeighbour(n)}
              className="flex min-h-11 w-full items-center gap-2 rounded-[12px] bg-panel px-2.5 text-left text-[12px] text-navy"
            >
              <CableCar className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate font-semibold">{n.name}</span>
              <span className="shrink-0 text-[11px] text-muted">
                {n.lifts.length} {n.lifts.length === 1 ? "Bahn" : "Bahnen"} · {km(n).toFixed(1)} km
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 px-1 text-[10px] leading-snug text-muted">
        Höchstens {pct(NEIGHBOURS.maxCut)}, und weniger, je grösser euer eigenes Gebiet ist.
      </p>
    </section>
  );
}

/** The setting: neighbours off, or «Gemütlich». */
export function NeighbourSetting() {
  const mode = useGame((s) => s.neighbours?.mode ?? "off");
  const matchRunning = useGame((s) => s.match.mode === "match" && s.match.phase === "plan");
  const sendIntent = useGame((s) => s.sendIntent);
  const options = [
    { v: "off" as const, label: "Aus" },
    { v: "gemuetlich" as const, label: "Gemütlich" },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-1 p-1.5">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            disabled={matchRunning}
            onClick={() => mode !== o.v && sendIntent({ type: "set_neighbours", mode: o.v })}
            className={`min-h-11 rounded-full text-[13px] font-semibold disabled:opacity-50 ${mode === o.v ? "bg-accent text-panel" : "text-navy"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="px-3 pb-2.5 text-[11px] leading-snug text-muted">
        {mode === "off"
          ? "Ihr seid allein im Tal."
          : "Andere Skigebiete in der Gegend wachsen langsam und teilen sich die Gäste mit euch. Euer Gebiet lassen sie in Ruhe."}
      </p>
    </>
  );
}

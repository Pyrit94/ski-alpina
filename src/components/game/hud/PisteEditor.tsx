import { useEffect, useMemo, useState } from "react";
import { Check, CircleCheck, CircleX, PenLine, Route, Undo2, X } from "lucide-react";
import { BY_ID, FLOW, PISTE_WIDTHS, type PisteGrade } from "@ski/config";
import {
  GRADE_LABEL,
  getDem,
  pisteCapacity,
  pisteCost,
  pisteLinks,
  pisteUpkeep,
  segmentGrades,
  surveyPiste,
  widthChangePrice,
  widthOf,
  type Anchor,
  type Axial,
  type PisteWidth,
  type PlacedPiste,
  type RouteTarget,
} from "@ski/shared";
import { fmt } from "@/lib/game/format";
import { hexToWorld } from "@/lib/game/hex";
import {
  GRADE_COLOR,
  TARGET_LABEL,
  finishBlocker,
  finishPisteDraft,
  isSkiRun,
  undoPisteStep,
  usePisteEditor,
} from "@/lib/game/piste-editor";
import { useGame } from "@/lib/game/store";
import { useIsDesktop } from "@/lib/game/use-breakpoint";

const elevAt = (h: Axial) => {
  const { x, z } = hexToWorld(h.q, h.r);
  return getDem().sample(x, z);
};
const slopeAt = (h: Axial) => {
  const { x, z } = hexToWorld(h.q, h.r);
  return getDem().slope(x, z);
};

/** Where a run joins, in words. */
const ANCHOR_LABEL: Record<Anchor["kind"], string> = {
  "lift-top": "Bergstation",
  "lift-base": "Talstation",
  piste: "andere Piste",
  village: "Dorf",
  exit: "Parkhaus/Hotel",
};

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; sub?: string; color?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-[14px] bg-ice p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex min-h-11 flex-1 flex-col items-center justify-center rounded-[11px] px-1 text-[12px] font-semibold leading-tight transition-colors ${active ? "bg-panel text-navy shadow-[var(--shadow-chip)]" : "text-muted"}`}
          >
            <span className="flex items-center gap-1">
              {o.color && <span className="size-2.5 rounded-full" style={{ background: o.color }} />}
              {o.label}
            </span>
            {o.sub && <span className="text-[9px] font-medium text-muted">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

const WIDTH_OPTIONS = PISTE_WIDTHS.map((w) => ({
  value: w.width as PisteWidth,
  label: w.label,
  sub: `${Math.round(w.capacity * 100)}% Kap.`,
}));

const TARGET_OPTIONS: { value: RouteTarget; label: string; color?: string }[] = [
  { value: "blue", label: TARGET_LABEL.blue, color: GRADE_COLOR.blue },
  { value: "red", label: TARGET_LABEL.red, color: GRADE_COLOR.red },
  { value: "black", label: TARGET_LABEL.black, color: GRADE_COLOR.black },
  { value: "any", label: TARGET_LABEL.any },
];

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="min-w-0 rounded-[12px] bg-snow px-1.5 py-1.5 text-center shadow-[inset_0_0_0_1px_rgba(11,31,58,.05)]">
      <div className="truncate text-[9px] font-semibold uppercase tracking-[0.05em] text-muted">{label}</div>
      <div className={`value mt-0.5 truncate text-[13px] font-bold leading-none ${tone === "bad" ? "text-danger" : "text-navy"}`}>
        {value}
      </div>
    </div>
  );
}

/**
 * The draft's height profile: one line per segment in its grade's colour,
 * and the snow line dashed across it. A run whose bottom dips under the
 * dashed line closes when the snow retreats.
 */
function ElevationProfile({ draft, snowLineM, compact }: { draft: readonly Axial[]; snowLineM: number; compact: boolean }) {
  const W = 260;
  const H = compact ? 38 : 58;
  const pad = 4;
  const elev = draft.map(elevAt);
  const grades = segmentGrades(draft, slopeAt);
  const lo = Math.min(...elev);
  const hi = Math.max(...elev);
  const span = Math.max(40, hi - lo);
  const x = (i: number) => pad + (i / Math.max(1, draft.length - 1)) * (W - pad * 2);
  const y = (m: number) => pad + (1 - (m - lo) / span) * (H - pad * 2);
  const snowY = Math.max(pad, Math.min(H - pad, y(snowLineM)));
  const snowInside = snowLineM >= lo && snowLineM <= lo + span;
  const area = `M${x(0)},${H} ${elev.map((e, i) => `L${x(i)},${y(e)}`).join(" ")} L${x(elev.length - 1)},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label={`Höhenprofil: ${fmt(Math.round(hi))} m bis ${fmt(Math.round(lo))} m`}>
      <path d={area} fill="#e8f3fb" />
      {grades.map((g, i) => (
        <line
          key={i}
          x1={x(i)}
          y1={y(elev[i]!)}
          x2={x(i + 1)}
          y2={y(elev[i + 1]!)}
          stroke={g ? GRADE_COLOR[g] : "#E24B4A"}
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}
      <line x1={0} x2={W} y1={snowY} y2={snowY} stroke="#7C8DA6" strokeWidth={1} strokeDasharray="4 3" />
      <text x={W - 2} y={snowY - 3} textAnchor="end" fontSize={9} fill="#7C8DA6">
        {snowInside ? "" : snowLineM > hi ? "↑ " : "↓ "}Schneegrenze {fmt(snowLineM)} m
      </text>
    </svg>
  );
}

function LinkLine({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <div className={`flex items-start gap-1.5 text-[11px] leading-snug ${ok ? "text-success" : "text-warn"}`}>
      {ok ? <CircleCheck className="mt-px size-3.5 shrink-0" /> : <CircleX className="mt-px size-3.5 shrink-0" />}
      <span>{ok ? okText : badText}</span>
    </div>
  );
}

/** Live numbers for the draft, from the same functions the server prices with. */
function useDraftStats(draft: readonly Axial[], itemId: string | null, width: PisteWidth) {
  return useMemo(() => {
    if (!itemId || draft.length < 2) return null;
    const id = itemId as keyof typeof BY_ID;
    const dem = getDem();
    const w = itemId === "piste" ? width : undefined;
    const survey = surveyPiste(dem, id, draft, w);
    const grade: PisteGrade | null = survey?.grade ?? null;
    const segments = draft.length - 1;
    const difficulty = grade ?? (itemId === "snowpark" ? "park" : itemId === "road" ? "road" : "blue");
    const piste = { itemId, difficulty, hexes: [...draft], width: w };
    return {
      grade,
      km: segments * FLOW.kmPerSegment,
      drop: Math.round(elevAt(draft[0]!) - elevAt(draft[draft.length - 1]!)),
      capacity: pisteCapacity(piste),
      price: pisteCost(dem, id, draft, w),
      upkeep: survey ? survey.upkeep : pisteUpkeep(piste),
    };
  }, [draft, itemId, width]);
}

/**
 * The piste editor: everything about the run being drawn in one card.
 *
 * Desktop: a floating card in the top-centre column. Phone: a compact tray
 * above the dock, where the dock's stamp button adds hexes. Replaces the
 * piste part of the build hint.
 */
export function PisteEditor({ compact = false }: { compact?: boolean }) {
  const phase = useGame((s) => s.phase);
  const buildItem = useGame((s) => s.buildItem);
  const draft = useGame((s) => s.pisteDraft);
  const coins = useGame((s) => s.coins);
  const stampMode = useGame((s) => s.stampMode);
  const snowLineM = useGame((s) => s.stats.snowLineM);
  const lifts = useGame((s) => s.lifts);
  const pistes = useGame((s) => s.pistes);
  const buildings = useGame((s) => s.buildings);
  const cancel = useGame((s) => s.cancelBuild);
  const width = usePisteEditor((s) => s.width);
  const target = usePisteEditor((s) => s.target);
  const mode = usePisteEditor((s) => s.mode);
  const name = usePisteEditor((s) => s.name);
  const blocked = usePisteEditor((s) => s.blocked);
  const strokes = usePisteEditor((s) => s.strokes);
  const setWidth = usePisteEditor((s) => s.setWidth);
  const setTarget = usePisteEditor((s) => s.setTarget);
  const setMode = usePisteEditor((s) => s.setMode);
  const setName = usePisteEditor((s) => s.setName);
  const desktop = useIsDesktop();
  const active = phase === "piste" && !!buildItem;
  const stats = useDraftStats(draft, buildItem, width);
  const ski = isSkiRun(buildItem);
  const isPiste = buildItem === "piste";
  const canRoute = buildItem !== "road";
  const routing = canRoute && mode === "route";

  const links = useMemo(
    () => (ski && draft.length > 0 ? pisteLinks({ ...useGame.getState(), lifts, pistes, buildings }, getDem(), draft) : null),
    [ski, draft, lifts, pistes, buildings],
  );
  const blocker = active ? finishBlocker(draft, coins, width) : null;

  // The editor forgets its strokes when it closes or the item changes;
  // width and target stay for the next run.
  useEffect(() => {
    usePisteEditor.getState().reset();
  }, [active, buildItem]);

  // Keyboard on desktop: Enter finishes, Escape cancels, Backspace takes back.
  useEffect(() => {
    if (!active || !desktop) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        finishPisteDraft();
      } else if (e.key === "Escape") {
        e.preventDefault();
        useGame.getState().cancelBuild();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        undoPisteStep();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, desktop]);

  if (!active) return null;
  const item = BY_ID[buildItem];

  const hint = routing
    ? draft.length === 0
      ? stampMode
        ? "Start unter das Raster schieben und setzen"
        : "Start antippen, am besten bei einer Bergstation"
      : stampMode
        ? "Ziel weiter unten anvisieren und setzen"
        : "Ziel weiter unten antippen – die Route folgt dem Hang"
    : draft.length === 0
      ? stampMode
        ? "Bergstation unter das Raster schieben und setzen"
        : "Bergstation antippen und talwärts ziehen"
      : stampMode
        ? "Raster talwärts schieben, Feld für Feld setzen"
        : "Weiter talwärts ziehen oder tippen, dann «Fertig»";

  const fertig = (
    <button
      type="button"
      onClick={finishPisteDraft}
      disabled={!!blocker}
      title={blocker ?? "Piste bauen (Enter)"}
      className="flex h-11 flex-1 items-center justify-center gap-1 rounded-full bg-success px-3 text-[13px] font-semibold text-panel disabled:bg-muted/40 disabled:text-panel/90"
    >
      <Check className="size-4" /> Fertig{stats && !blocker ? ` · ${fmt(stats.price)}` : ""}
    </button>
  );
  const zurueck = (
    <button
      type="button"
      onClick={undoPisteStep}
      disabled={draft.length === 0}
      title="Letzten Strich zurücknehmen (Rücktaste)"
      className="flex h-11 items-center justify-center gap-1 rounded-full bg-ice px-3 text-[12px] font-semibold text-navy disabled:opacity-40"
    >
      <Undo2 className="size-4" /> Zurück
      {strokes.length > 1 && <span className="text-[10px] text-muted">({strokes.length})</span>}
    </button>
  );

  return (
    <div
      className={`pointer-events-auto rounded-[20px] bg-panel/95 shadow-[var(--shadow-panel)] backdrop-blur-md ${compact ? "mb-1.5 p-2" : "w-[min(94vw,340px)] p-3"}`}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-navy">{item.name}</div>
          <div className="truncate text-[11px] text-muted">{hint}</div>
        </div>
        {canRoute && (
          <div className="flex shrink-0 rounded-full bg-ice p-0.5" role="radiogroup" aria-label="Modus">
            {(
              [
                ["draw", "Zeichnen", PenLine],
                ["route", "Route", Route],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`flex h-11 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold ${mode === m ? "bg-accent text-panel" : "text-navy"}`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isPiste && (
        <div className="mt-2">
          {!compact && <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Breite</div>}
          <Segmented label="Breite" value={width} options={WIDTH_OPTIONS} onChange={setWidth} />
        </div>
      )}

      {routing && isPiste && (
        <div className="mt-2">
          {!compact && <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Ziel-Schwierigkeit</div>}
          <Segmented label="Ziel-Schwierigkeit" value={target} options={TARGET_OPTIONS} onChange={setTarget} />
        </div>
      )}

      {stats && (
        <>
          <div className="mt-2 flex items-center gap-2">
            {stats.grade ? (
              <span
                className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold text-panel"
                style={{ background: GRADE_COLOR[stats.grade] }}
              >
                {GRADE_LABEL[stats.grade]} Piste
              </span>
            ) : (
              <span className="shrink-0 text-[11px] font-semibold text-navy">{item.name}</span>
            )}
            <span className="value text-[11px] text-muted">
              {stats.km.toFixed(2)} km · {fmt(stats.drop)} m Gefälle
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            <MiniStat label="Kapazität" value={`${fmt(stats.capacity)}/h`} />
            <MiniStat label="Preis" value={fmt(stats.price)} tone={coins < stats.price ? "bad" : undefined} />
            <MiniStat label="Unterhalt/Tag" value={`−${fmt(stats.upkeep)}`} />
          </div>
          {draft.length >= 2 && (
            <div className="mt-1.5">
              <ElevationProfile draft={draft} snowLineM={snowLineM} compact={compact} />
            </div>
          )}
        </>
      )}

      {links && (
        <div className="mt-1.5 space-y-0.5">
          <LinkLine
            ok={links.start !== null}
            okText={`Start bei ${links.start ? ANCHOR_LABEL[links.start.kind] : ""}`}
            badText="Start liegt bei keiner Bergstation – hier kommen keine Gäste an"
          />
          {draft.length >= 2 && (
            <LinkLine
              ok={links.end !== null}
              okText={`Ende bei ${links.end ? ANCHOR_LABEL[links.end.kind] : ""}`}
              badText="Ende liegt nicht bei einer Talstation – Gäste kommen hier nicht weg"
            />
          )}
        </div>
      )}

      {blocked && (
        <div className="mt-1.5 rounded-[10px] bg-danger/10 px-2 py-1 text-[11px] font-medium text-danger">{blocked.reason}</div>
      )}

      {!compact && (
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          placeholder="Name (optional), z. B. Riffelalp-Abfahrt"
          aria-label="Name der Piste"
          className="mt-2 h-11 w-full rounded-[12px] bg-snow px-3 text-[12px] text-navy outline-none ring-1 ring-line placeholder:text-subtle focus:ring-accent"
        />
      )}

      {compact ? (
        <div className="mt-1.5 flex gap-1.5">{zurueck}</div>
      ) : (
        <>
          <div className="mt-2 flex gap-1.5">
            {zurueck}
            <button
              type="button"
              onClick={cancel}
              title="Abbrechen (Esc)"
              className="flex h-11 items-center justify-center gap-1 rounded-full bg-ice px-3 text-[12px] font-semibold text-danger"
            >
              <X className="size-4" /> Abbrechen
            </button>
            {fertig}
          </div>
          {blocker && draft.length > 0 && (
            <div className="mt-1 text-center text-[10px] text-muted">Fertig nicht möglich: {blocker}</div>
          )}
          <div className="mt-1 text-center text-[10px] text-subtle">Enter fertig · Esc abbrechen · Rücktaste zurück</div>
        </>
      )}
    </div>
  );
}

/**
 * Rename a built run or change its width.
 *
 * Shown in the run's info card. A rename is free; a width change shows what
 * it costs (or gives back) before it is sent.
 */
export function PisteEditPanel({ piste }: { piste: PlacedPiste }) {
  const coins = useGame((s) => s.coins);
  const sendIntent = useGame((s) => s.sendIntent);
  const [draftName, setDraftName] = useState(piste.name ?? "");
  const [editing, setEditing] = useState(false);
  const current = widthOf(piste);
  const prices = useMemo(
    () => Object.fromEntries(PISTE_WIDTHS.map((w) => [w.width, widthChangePrice(piste, w.width, getDem())])) as Record<PisteWidth, number>,
    [piste],
  );
  const isPiste = piste.itemId === "piste";
  const saveName = () => {
    const clean = draftName.trim().slice(0, 32);
    if (clean !== (piste.name ?? "")) sendIntent({ type: "edit_piste", pisteId: piste.id, name: clean });
    setEditing(false);
  };
  return (
    <div className="mt-3">
      {editing ? (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            saveName();
          }}
        >
          <input
            autoFocus
            value={draftName}
            maxLength={32}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="z. B. Matterhorn-Abfahrt"
            aria-label="Name der Piste"
            className="h-11 min-w-0 flex-1 rounded-[12px] bg-snow px-3 text-[12px] text-navy outline-none ring-1 ring-line focus:ring-accent"
          />
          <button type="submit" className="h-11 rounded-full bg-accent px-3 text-[12px] font-semibold text-panel">
            Speichern
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraftName(piste.name ?? "");
            setEditing(true);
          }}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-ice text-[12px] font-semibold text-navy"
        >
          <PenLine className="size-3.5" /> {piste.name ? "Umbenennen" : "Namen geben"}
        </button>
      )}
      {isPiste && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Breite</div>
          <div className="flex gap-1 rounded-[14px] bg-ice p-1" role="radiogroup" aria-label="Breite">
            {PISTE_WIDTHS.map((w) => {
              const active = w.width === current;
              const price = prices[w.width];
              const tooExpensive = !active && price > coins;
              return (
                <button
                  key={w.width}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={active || tooExpensive}
                  onClick={() => sendIntent({ type: "edit_piste", pisteId: piste.id, width: w.width })}
                  className={`flex min-h-11 flex-1 flex-col items-center justify-center rounded-[11px] px-1 text-[12px] font-semibold leading-tight ${active ? "bg-panel text-navy shadow-[var(--shadow-chip)]" : "text-navy disabled:opacity-50"}`}
                >
                  {w.label}
                  <span className={`value text-[9px] font-medium ${tooExpensive ? "text-danger" : "text-muted"}`}>
                    {active ? "aktuell" : price >= 0 ? `−${fmt(price)}` : `+${fmt(-price)} zurück`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

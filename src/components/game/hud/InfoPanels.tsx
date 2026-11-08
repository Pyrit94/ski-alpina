import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, Move, Trash2, X } from "lucide-react";
import { peerColor } from "@/lib/game/players";
import { BY_ID, ECONOMY, FLOW, GRADE_LABEL, SEASON_LABEL, UPGRADES, isLift, liftThroughput, seasonPhase } from "@/lib/game/catalog";
import type { CatalogItem } from "@/lib/game/catalog";
import { BUILDING_LEVELS, PISTE_LEVELS, TERRAIN } from "@ski/config";
import { buildingLevel, expandable, expansionCost, expansionSpent, getDem, PENDING_READY, pisteExpandable, pisteExpansionCost, pisteExpansionSpent, pisteLevel, midStationCost, midStationSpots, missingLegs, scorePiste, STATION_LEGS, starsFor, type StationLeg, siteAt, siteContext, siteKind, widthDef, type ResortState } from "@ski/shared";
import { RatingChip, RatingParts } from "./PisteRating";
import { ReshapeOne } from "./Reshape";
import { pct, siteTone } from "@/lib/game/placement";
import { useStableGame } from "../canvas/use-stable-game";
import { buildingLevelLabel, levelGain, pisteLevelLabel } from "@/lib/game/expansion";
import { GRADE_COLOR } from "@/lib/game/piste-editor";
import { fmt, fmtCompact, fmtSigned } from "@/lib/game/format";
import { useMyMoney } from "@/lib/game/team";
import { LinkStatus } from "./LinkStatus";
import { AutoPistesButton } from "./AutoPistes";
import { MIXES } from "@/lib/game/auto-pistes";
import { play } from "@/lib/game/sound";
import { realMetres } from "@/lib/game/real-height";
import { PisteEditPanel } from "./PisteEditor";
import { useBuildTerms } from "@/lib/game/research";
import { useGame } from "@/lib/game/store";
import { usePlanner } from "@/lib/game/planner";
import { plannerState } from "@/lib/game/planner-jobs";
import { BusyNote } from "./Calculating";
import type { PlacedPiste } from "@/lib/game/types";
import { sinceLabel, LOW_USE, refundFor } from "./hud-shared";
import { ItemThumb, Panel, Stat, Warning, PlayersLine } from "./HudBits";

/**
 * What has happened in this resort, and who did it.
 *
 * Events were broadcast and forgotten: coming back after an hour told you
 * nothing about what your partner had changed, and no event named its author.
 * The log lives in the save, so it survives a reload and a restart.
 */
export function ActivityPanel() {
  const activity = useGame((s) => s.activity);
  const contributors = useGame((s) => s.contributors);
  const me = useGame((s) => s.playerId);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

  const ranked = Object.entries(contributors).sort((a, b) => b[1].builds - a[1].builds);
  if (activity.length === 0 && ranked.length === 0) return null;

  return (
    <Panel className="p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
        Gemeinsam gebaut
      </div>
      {ranked.length > 0 && (
        <div className="mb-2.5 flex flex-col gap-1">
          {ranked.map(([id, c]) => (
            <div key={id} className="flex items-center gap-2 text-[11px]">
              <span className="size-2 shrink-0 rounded-full" style={{ background: peerColor(id) }} />
              <span className="min-w-0 flex-1 truncate font-medium text-navy">
                {c.name}
                {id === me && <span className="ml-1 text-muted">(du)</span>}
              </span>
              <span className="tabular-nums text-muted">{c.builds} Bauten</span>
              <span className="tabular-nums text-subtle">{fmtCompact(c.coinsSpent)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {activity.slice(0, 6).map((a) => (
          <div key={a.id} className="flex gap-2 text-[11px] leading-snug">
            <span
              className="mt-1 size-1.5 shrink-0 rounded-full"
              style={{ background: a.actor ? peerColor(a.actor) : "#7C8DA6" }}
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium text-navy">{a.actorName}</span>
              <span className="text-muted"> · {a.body}</span>
            </span>
            <span className="shrink-0 tabular-nums text-subtle">{sinceLabel(a.at, now)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function InfoPanel() {
  const selectedId = useGame((s) => s.selectedId);
  const buildings = useGame((s) => s.buildings);
  const lifts = useGame((s) => s.lifts);
  const pistes = useGame((s) => s.pistes);
  const stats = useGame((s) => s.stats);
  const flow = useGame((s) => s.flow);
  const upgrade = useGame((s) => s.upgrade);
  const coins = useMyMoney().mine;
  // A station stands for its lift: that is what carries guests and what
  // upgrades act on.
  const lift = lifts.find((l) => l.id === selectedId || l.stationA === selectedId || l.stationB === selectedId || l.stationMid === selectedId);
  const b = lift ? undefined : buildings.find((x) => x.id === selectedId);
  const piste = pistes.find((p) => p.id === selectedId);
  const item = lift ? BY_ID[lift.itemId] : b ? BY_ID[b.itemId] : piste ? BY_ID[piste.itemId] : null;
  const entity = lift ?? b;
  if (item && piste && !entity) return <PisteInfo piste={piste} item={item} />;
  if (!item || !entity) {
    return (
      <Panel className="p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Info</div>
        <p className="mt-2 text-[12px] text-muted">Tippe ein Gebäude oder eine Bahn, um Details zu sehen.</p>
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <Stat label="Gäste" value={`${fmt(stats.guestsPerHour)}`} />
          <Stat
            label="Zufrieden"
            value={`${stats.satisfaction}%`}
            tone={stats.satisfaction < 55 ? "bad" : stats.satisfaction < 75 ? "warn" : "good"}
          />
          <Stat
            label="Einnahmen"
            value={`${stats.incomePerHour < 0 ? "−" : "+"}${fmt(Math.abs(stats.incomePerHour))}`}
            tone={stats.incomePerHour < 0 ? "bad" : "good"}
          />
        </div>
        <PlayersLine />
        <p className="mt-3 text-[10px] leading-snug text-subtle">
          {TERRAIN.attribution}
        </p>
      </Panel>
    );
  }
  const cap = isLift(item.id) ? liftThroughput(item, entity.upgrades) : item.capacity;
  const constructing = entity.readyAt > Date.now();
  const pendingRound = entity.readyAt >= PENDING_READY;
  // What the sim actually routed through this installation this tick.
  const edge = flow.find((e) => e.id === entity.id);
  const load = edge && edge.capacity > 0 ? Math.min(1, edge.flow / edge.capacity) : 0;
  return (
    <Panel className="p-3">
      <div className="flex items-start gap-2">
        <ItemThumb id={item.id} className="size-12 shrink-0 rounded-[12px]" iconClass="size-5" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-navy">{item.name}</div>
          {lift ? (
            <div className="mt-0.5 inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
              Ausbau {UPGRADES.reduce((n, u) => n + lift.upgrades[u.key], 0)}/{UPGRADES.reduce((n, u) => n + u.max, 0)}
            </div>
          ) : b && expandable(b.itemId) ? (
            <div className="mt-0.5 inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
              Stufe {buildingLevel(b)}
            </div>
          ) : null}
        </div>
      </div>
      {constructing && (
        <div className="mt-2 text-[11px] text-warn">{pendingRound ? "Wird bis Ende der Runde fertig." : "Im Bau…"}</div>
      )}
      <BuiltByLine builtBy={entity.builtBy} />
      {lift && <LiftName key={lift.id} id={lift.id} name={lift.name ?? ""} />}
      {edge?.unit === "chf" ? (
        <div className="mt-3 grid grid-cols-2 gap-1.5 text-center">
          <Stat label="Mehrumsatz/T" value={`+${fmt(edge.flow)}`} tone="good" />
          <Stat label="Wirkung" value={`+${Math.round(ECONOMY.ticketOfficeIncomeBonus * 100)} % Tickets`} />
        </div>
      ) : edge?.unit === "arrivals" || edge?.unit === "served" ? (
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <Stat label={edge.unit === "arrivals" ? "Platz für" : "Bedient max."} value={`${fmt(edge.capacity)}/h`} />
          <Stat label="Ausgelastet" value={`${Math.round(load * 100)}%`} />
          <Stat label={edge.unit === "arrivals" ? "Ankünfte" : "Gäste"} value={`${fmt(edge.flow)}/h`} />
        </div>
      ) : edge || isLift(item.id) ? (
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <Stat label="Kapazität" value={cap ? `${fmt(cap)}/h` : "—"} />
          <Stat label="Ausgelastet" value={edge ? `${Math.round(load * 100)}%` : "—"} />
          <Stat label="Fahrten" value={edge ? `${fmt(Math.round(edge.flow))}/h` : "—"} />
        </div>
      ) : (
        <p className="mt-3 rounded-[12px] bg-ice px-3 py-2 text-[12px] leading-snug text-navy">{item.blurb}</p>
      )}
      {lift && <LinkStatus id={lift.id} kind="lift" />}
      {lift && <AutoPistesButton liftId={lift.id} variant="link" className="mt-1" />}
      {lift && !lift.mid && <MidStationOffer liftId={lift.id} />}
      {lift && edge && edge.link === "ok" && load < LOW_USE && <LowUseHint />}
      {isLift(item.id) && (
        <div className="mt-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Upgrades</div>
          <div className="grid grid-cols-3 gap-1">
            {UPGRADES.map((u) => {
              const lv = entity.upgrades[u.key];
              const cost = u.cost[lv] ?? 0;
              const maxed = lv >= u.max;
              return (
                <button
                  key={u.key}
                  type="button"
                  disabled={maxed || coins < cost}
                  onClick={() => upgrade(entity.id, u.key)}
                  className="min-h-14 rounded-[12px] bg-ice px-1 py-2 text-center disabled:opacity-50"
                >
                  <div className="text-[9px] font-medium text-muted">{u.label}</div>
                  <div className="text-[11px] font-semibold text-navy">
                    Stufe {lv}/{u.max}
                  </div>
                  <div className="text-[9px] text-coin">{maxed ? "Max" : fmt(cost)}</div>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-muted">
            Jede Stufe erhöht die Förderleistung. Kapazität wirkt am stärksten.
          </p>
        </div>
      )}
      {b && expandable(b.itemId) && (
        <LevelSection
          id={b.id}
          level={buildingLevel(b)}
          max={BUILDING_LEVELS.maxLevel}
          label={(l) => buildingLevelLabel(b.itemId, l)}
          gain={() => levelGain(b.itemId)}
          cost={expansionCost(b)}
          disabled={constructing}
        />
      )}
      {b && siteKind(b.itemId) && <SiteRow id={b.id} itemId={b.itemId} q={b.q} r={b.r} />}
      {b && !isLift(b.itemId) && <MoveButton id={b.id} itemId={b.itemId} />}
      <DemolishButton id={entity.id} refund={refundFor(item.cost + (b ? expansionSpent(b) : 0))} label={item.name} />
    </Panel>
  );
}

/**
 * Expansion: one more deck, one more wing, snow guns along a run. Each level
 * makes the one building do more, so the valley is not paved with copies.
 */
function LevelSection({
  id,
  level,
  max,
  label,
  gain,
  cost: list,
  disabled,
}: {
  id: string;
  level: number;
  max: number;
  label: (level: number) => string;
  gain: (next: number) => string;
  cost: number | null;
  disabled?: boolean;
}) {
  const expand = useGame((s) => s.expand);
  const terms = useBuildTerms();
  const coins = useMyMoney().mine;
  const cost = list === null ? null : terms.discount(list);
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <span>Ausbau</span>
        <span className="truncate normal-case tracking-normal">
          Stufe {level} von {max} · {label(level)}
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < level ? "bg-accent" : "bg-ice"}`} />
        ))}
      </div>
      {cost === null ? (
        <p className="mt-2 text-[11px] leading-snug text-muted">Voll ausgebaut.</p>
      ) : (
        <button
          type="button"
          disabled={disabled || coins < cost}
          onClick={() => expand(id)}
          className="mt-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-[12px] bg-ice px-3 py-1.5 text-left disabled:opacity-50"
        >
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-navy">{label(level + 1)}</span>
            <span className="block text-[10px] leading-snug text-muted">{gain(level + 1) || "mehr Wirkung"}, mehr Unterhalt</span>
          </span>
          <span className="shrink-0 text-[12px] font-semibold text-coin">{fmt(cost)}</span>
        </button>
      )}
    </div>
  );
}

/**
 * Why a working lift stands nearly empty — almost always missing guests, not
 * missing capacity, which is the opposite of what the upgrade buttons suggest.
 */
function LowUseHint() {
  const stats = useGame((s) => s.stats);
  const reasons: string[] = [];
  if (stats.turnedAway > 0) reasons.push(`${fmt(stats.turnedAway)} Gäste/h finden keinen Platz im Tal: Parkhaus, Bus oder Hotel bauen`);
  reasons.push("mehr Pisten-Kilometer und mehr Farben (blau, rot, schwarz) ziehen mehr Gäste an");
  if (stats.satisfaction < 70) reasons.push("zufriedenere Gäste kommen öfter: Restaurant, Shop, kürzere Wartezeiten");
  return (
    <div className="mt-2 rounded-[12px] bg-accent-soft/40 px-2.5 py-2 text-[11px] leading-snug text-navy">
      <div className="font-bold">Warum so leer?</div>
      Es fehlen Gäste, nicht Kapazität – ein Ausbau würde die Auslastung sogar senken. Was hilft:
      <ul className="mt-1 list-disc pl-4">
        {reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Who put this here.
 *
 * Resolved through the persisted contributor list rather than the live player
 * list, so the name still shows after that player has gone offline — or after
 * a server restart, when their session id no longer exists.
 */
function BuiltByLine({ builtBy }: { builtBy?: string }) {
  const contributors = useGame((s) => s.contributors);
  const me = useGame((s) => s.playerId);
  if (!builtBy) return null;
  const who = contributors[builtBy];
  if (!who) return null;
  return (
    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
      <span className="size-2 rounded-full" style={{ background: peerColor(builtBy) }} />
      Gebaut von <span className="font-medium text-navy">{who.name}</span>
      {builtBy === me && <span>(du)</span>}
    </div>
  );
}

function PisteInfo({ piste, item }: { piste: PlacedPiste; item: CatalogItem }) {
  const flow = useGame((s) => s.flow);
  const stats = useGame((s) => s.stats);
  const edge = flow.find((e) => e.id === piste.id);
  const segments = Math.max(1, piste.hexes.length - 1);
  const load = edge && edge.capacity > 0 ? Math.min(1, edge.flow / edge.capacity) : 0;
  const closed = Boolean(edge && edge.capacity <= 0);
  const grade = piste.difficulty === "blue" || piste.difficulty === "red" || piste.difficulty === "black" ? piste.difficulty : null;
  const widthLabel = piste.itemId === "piste" ? widthDef(piste.width).label : null;
  const rating = useMemo(() => (piste.difficulty === "road" ? null : scorePiste(piste.hexes, getDem())), [piste.hexes, piste.difficulty]);
  return (
    <Panel className="p-3">
      <div className="truncate text-[13px] font-semibold uppercase tracking-wide text-navy">{piste.name || item.name}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        {grade && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold text-panel"
            style={{ background: GRADE_COLOR[grade] }}
          >
            {GRADE_LABEL[grade]}
          </span>
        )}
        {widthLabel && <span>{widthLabel} ·</span>}
        {segments} Segmente · {(segments * FLOW.kmPerSegment).toFixed(1)} km
      </div>
      {rating && (
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="font-semibold text-navy">Pistenwertung</span>
            <RatingChip points={rating.points} stars={rating.stars} />
          </div>
          <RatingParts score={rating} />
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <Stat label="Kapazität" value={edge ? `${fmt(edge.capacity)}/h` : "—"} />
        <Stat label="Ausgelastet" value={edge ? `${Math.round(load * 100)}%` : "—"} />
        <Stat label="Fahrten" value={edge ? `${fmt(Math.round(edge.flow))}/h` : "—"} />
      </div>
      {closed && (
        <p className="mt-2 rounded-[12px] bg-danger/10 px-2 py-1.5 text-[11px] leading-snug text-danger">
          Zu: die Talseite dieser Abfahrt liegt unter der Schneegrenze von {fmt(realMetres(stats.snowLineM))} m.
        </p>
      )}
      {!closed && piste.difficulty !== "road" && <LinkStatus id={piste.id} kind="piste" />}
      <BuiltByLine builtBy={piste.builtBy} />
      {pisteExpandable(piste) && (
        <LevelSection
          id={piste.id}
          level={pisteLevel(piste)}
          max={PISTE_LEVELS.maxLevel}
          label={(l) => pisteLevelLabel(l).label}
          gain={(l) => pisteLevelLabel(l).gain}
          cost={pisteExpansionCost(piste)}
        />
      )}
      {piste.itemId === "piste" && <ReshapeOne key={`re-${piste.id}`} pisteId={piste.id} />}
      <PisteEditPanel key={piste.id} piste={piste} />
      <DemolishButton id={piste.id} refund={refundFor(item.cost * segments + pisteExpansionSpent(piste))} label={piste.name || item.name} />
    </Panel>
  );
}

/**
 * Tearing something down, behind one confirmation.
 *
 * Upkeep made overbuilding a real mistake, and without this there was no way
 * to correct one — the account simply bled.
 */
function DemolishButton({ id, refund, label }: { id: string; refund: number; label: string }) {
  const demolish = useGame((s) => s.demolish);
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="btn-3d btn-3d-light mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-ice text-[12px] font-bold text-danger"
      >
        <Trash2 className="size-3.5" /> Abreissen
      </button>
    );
  }
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] leading-snug text-muted">
        {label} entfernen? Du bekommst <span className="font-semibold text-navy">{fmt(refund)}</span>{" "}
        CHF zurück.
      </p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="btn-3d btn-3d-light h-11 flex-1 rounded-full bg-ice text-[12px] font-bold text-navy"
        >
          Behalten
        </button>
        <button
          type="button"
          onClick={() => {
            demolish(id);
            setArmed(false);
          }}
          className="btn-3d h-11 flex-1 rounded-full bg-danger text-[12px] font-bold text-panel"
          style={{ ["--lip" as string]: "#9c2626" }}
        >
          Abreissen
        </button>
      </div>
    </div>
  );
}

/**
 * What the flow graph knows, in the player's language.
 *
 * Without this the two things that decide a resort — whether an installation is
 * connected at all, and what the queue is stuck behind — are invisible, and a
 * lift that carries nobody looks exactly like one that carries thousands.
 */
/**
 * The last two weeks, one bar per day: guests, and what was left after
 * upkeep. One series per chart, so no legend; the newest value is labelled,
 * every bar has its own tooltip.
 */
function DailyHistory() {
  const daily = useGame((s) => s.daily) ?? [];
  const days = daily.slice(-14);
  if (days.length < 2) {
    return <p className="mt-3 text-[11px] text-subtle">Der Verlauf erscheint nach den ersten Spieltagen.</p>;
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <DayBars title="Gäste pro Tag" values={days.map((d) => d.guests)} labels={days.map((d) => `S${d.season} T${d.day}`)} />
      <DayBars title="Gewinn pro Tag" values={days.map((d) => d.income)} labels={days.map((d) => `S${d.season} T${d.day}`)} signed />
    </div>
  );
}

function DayBars({ title, values, labels, signed = false }: { title: string; values: number[]; labels: string[]; signed?: boolean }) {
  const W = 140;
  const H = 44;
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const hasNeg = signed && values.some((v) => v < 0);
  const base = hasNeg ? H / 2 : H;
  const scale = hasNeg ? H / 2 / max : H / max;
  const step = W / values.length;
  const bar = Math.max(2, step - 2);
  const last = values[values.length - 1] ?? 0;
  const fmtV = (v: number) => (signed ? `${v < 0 ? "−" : "+"}${fmtCompact(Math.abs(v))}` : fmtCompact(v));
  return (
    <div className="rounded-[12px] bg-snow p-2">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted">{title}</span>
        <span className="value text-[11px] font-bold text-navy">{fmtV(last)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-11 w-full" role="img" aria-label={`${title}, letzte ${values.length} Tage`}>
        {hasNeg && <line x1={0} x2={W} y1={base} y2={base} stroke="currentColor" className="text-line" strokeWidth={1} />}
        {values.map((v, i) => {
          const h = Math.max(1, Math.abs(v) * scale);
          const y = v >= 0 ? base - h : base;
          return (
            <rect
              key={i}
              x={i * step + 1}
              y={y}
              width={bar}
              height={h}
              rx={Math.min(2, bar / 2)}
              className={signed && v < 0 ? "fill-danger/80" : "fill-accent"}
            >
              <title>{`${labels[i]}: ${fmtV(v)}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

export function OperationsPanel() {
  const stats = useGame((s) => s.stats);
  const day = useGame((s) => s.day);
  const mode = useGame((s) => s.match.mode);
  const idle = stats.idleLifts + stats.idlePistes;
  const phase = seasonPhase(day);
  return (
    <Panel className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Betrieb</span>
        <span className="text-[10px] text-subtle">{mode === "match" ? "Vorschau Mittag" : "jetzt"}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Stat label="Nachfrage/h" value={fmt(stats.marketPerHour)} />
        <Stat label="Fahrten/h" value={fmt(stats.peoplePerHour)} tone={stats.queued > 0 ? "warn" : "good"} />
        <Stat
          label="Warten"
          value={`${stats.waitMinutes}′`}
          tone={stats.waitMinutes > 12 ? "bad" : stats.waitMinutes > 6 ? "warn" : "neutral"}
        />
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center">
        <Stat label="Umsatz/Tag" value={fmt(stats.revenuePerHour)} />
        <Stat label="Kosten/Tag" value={`−${fmt(stats.upkeepPerHour)}`} tone="warn" />
        <Stat label="Gewinn/Tag" value={fmtSigned(stats.incomePerHour)} tone={stats.incomePerHour < 0 ? "bad" : "good"} />
      </div>
      {(stats.openingBoost ?? 1) > 1.01 && (
        <div className="mt-1.5 rounded-[12px] bg-coin/15 px-2.5 py-1.5 text-[11px] font-semibold text-navy">
          🎉 Eröffnungssaison: +{Math.round(((stats.openingBoost ?? 1) - 1) * 100)} % Nachfrage – das neue Gebiet spricht sich herum.
        </div>
      )}
      <div className="mt-2 flex flex-col gap-1.5">
        {stats.incomePerHour < 0 && (
          <Warning tone="bad">
            Der Unterhalt frisst mehr, als das Gebiet einnimmt. Schliess ungenutzte Anlagen ans Netz
            an oder mach den Berg attraktiver.
          </Warning>
        )}
        {idle > 0 && (
          <Warning tone="bad">
            {idle === 1 ? "Eine Anlage hat" : `${idle} Anlagen haben`} keine Gäste. Tippe den Lift an
            und wähle «Abfahrt anlegen» – eine Piste bis zu einer Talstation, ins Dorf oder auf eine
            andere Piste genügt.
          </Warning>
        )}
        {stats.queued > 0 && idle === 0 && (
          <Warning tone="warn">
            {fmt(stats.queued)} Fahrten pro Stunde stehen an.
            {stats.bottleneckLabel
              ? ` Engpass: ${stats.bottleneckLabel} bei ${Math.round(stats.bottleneckUse * 100)} %.`
              : " Es fehlt eine Verbindung ins Gebiet."}
          </Warning>
        )}
        {stats.turnedAway > 0 && (
          <Warning tone="warn">
            {fmt(stats.turnedAway)} Gäste pro Stunde kommen nicht ins Tal: mehr Parkhäuser, ein
            Busbahnhof oder Hotelbetten helfen.
          </Warning>
        )}
        {stats.queued <= 0 && stats.bottleneckLabel && (
          <Warning tone="warn">
            {stats.bottleneckLabel} läuft bei {Math.round(stats.bottleneckUse * 100)} % — der
            nächste Ausbau gehört dorthin.
          </Warning>
        )}
        {stats.closedPistes > 0 && (
          <Warning tone="warn">
            {stats.closedPistes === 1 ? "Eine Piste liegt" : `${stats.closedPistes} Pisten liegen`}{" "}
            unter der Schneegrenze und {stats.closedPistes === 1 ? "ist" : "sind"} zu.
            {phase === "summer"
              ? " Im Sommer fährt nur, was auch talwärts fährt."
              : " Beschneiung oder höher gelegene Abfahrten helfen."}
          </Warning>
        )}
        {stats.marketPerHour === 0 && stats.liftCapacity === 0 && (
          <Warning tone="warn">
            Noch kein Skigebiet: Bau einen Lift vom Dorf hinauf und eine Piste zurück. Gäste kommen
            wegen der Pisten – je mehr und abwechslungsreicher, desto mehr.
          </Warning>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 text-[10px] text-muted">
        <span>{SEASON_LABEL[phase]}</span>
        <span>Schneegrenze {fmt(realMetres(stats.snowLineM))} m</span>
        <span>Pisten {stats.pisteKm} km</span>
        <span>Liftkapazität {fmt(stats.liftCapacity)}/h</span>
        <span>Betten {fmt(stats.beds)}</span>
        <span>Höhenmeter {fmtCompact(stats.verticalPerHour)}/h</span>
      </div>
      <DailyHistory />
    </Panel>
  );
}

/**
 * The day ticket price, the one lever that acts every day.
 *
 * Kept local while dragging and sent once on release, so a slide does not
 * become forty intents and forty activity entries.
 */
export function TicketPricePanel() {
  const price = useGame((s) => s.ticketPrice);
  const setPrice = useGame((s) => s.setTicketPrice);
  const finished = useGame((s) => s.match.phase === "finished" && s.match.mode === "match");
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? price;
  const commit = () => {
    if (draft !== null && draft !== price) setPrice(draft);
    setDraft(null);
  };
  const ref = ECONOMY.ticketReference;
  const mood = value > ref + 15 ? "Teuer – weniger Gäste, unzufriedener" : value < ref - 15 ? "Günstig – volle Pisten, wenig pro Gast" : "Marktüblich";
  return (
    <Panel className="p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Tageskarte</span>
        <span className="value text-[16px] font-bold text-navy">{value} CHF</span>
      </div>
      <input
        type="range"
        min={ECONOMY.ticketMin}
        max={ECONOMY.ticketMax}
        step={1}
        value={value}
        disabled={finished}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-label="Preis der Tageskarte"
        className="mt-2 h-2 w-full cursor-pointer accent-[var(--color-accent)]"
      />
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
        <span>{ECONOMY.ticketMin}</span>
        <span className={value > ref + 15 ? "font-semibold text-warn" : value < ref - 15 ? "font-semibold text-accent" : ""}>{mood}</span>
        <span>{ECONOMY.ticketMax}</span>
      </div>
    </Panel>
  );
}

/** The resort's name, shown in the top bar and in the hall of fame. */
/** Pick a building up and put it somewhere else, for a small fee. */
function MoveButton({ id, itemId }: { id: string; itemId: string }) {
  const startMove = useGame((s) => s.startMove);
  const terms = useBuildTerms();
  const fee = terms.discount(Math.round((BY_ID[itemId as keyof typeof BY_ID]?.cost ?? 0) * ECONOMY.moveCostShare));
  return (
    <button
      type="button"
      onClick={() => startMove(id)}
      className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-ice text-[12px] font-bold text-navy"
    >
      <Move className="size-4" /> Verschieben · {fmt(fee)}
    </button>
  );
}

/** A name for a lift, so «Sessellift 2» can become «Sunnegga-Express». */
function LiftName({ id, name }: { id: string; name: string }) {
  const nameLift = useGame((s) => s.nameLift);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? name;
  const dirty = draft !== null && draft.trim() !== name;
  return (
    <form
      className="mt-2 flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) nameLift(id, value.trim());
        setDraft(null);
      }}
    >
      <input
        value={value}
        maxLength={32}
        placeholder="Name der Bahn, z. B. Sunnegga-Express"
        aria-label="Name der Bahn"
        onChange={(e) => setDraft(e.target.value)}
        className="h-11 min-w-0 flex-1 rounded-full bg-snow px-3 text-[13px] text-navy outline-none ring-1 ring-line placeholder:text-subtle focus:ring-accent"
      />
      {dirty && (
        <button type="submit" className="h-11 shrink-0 rounded-full bg-accent px-3 text-[12px] font-bold text-panel">
          Speichern
        </button>
      )}
    </form>
  );
}

export function RenamePanel() {
  const name = useGame((s) => s.resortName);
  const rename = useGame((s) => s.rename);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? name;
  const dirty = draft !== null && draft.trim().length >= 2 && draft.trim() !== name;
  return (
    <Panel className="p-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Name des Gebiets</div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) rename(value.trim());
          setDraft(null);
        }}
      >
        <input
          value={value}
          maxLength={28}
          onChange={(e) => setDraft(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-full bg-snow px-3 text-[13px] text-navy outline-none ring-1 ring-line focus:ring-accent"
        />
        <button
          type="submit"
          disabled={!dirty}
          className="h-10 shrink-0 rounded-full bg-accent px-3 text-[12px] font-bold text-panel disabled:opacity-40"
        >
          Speichern
        </button>
      </form>
    </Panel>
  );
}

export function Quests() {
  const quests = useGame((s) => s.quests);
  const claim = useGame((s) => s.claimQuest);
  const stats = useGame((s) => s.stats);
  const active = quests.filter((q) => !q.claimed).slice(0, 3);
  return (
    <Panel className="p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Aufträge</div>
      <div className="flex flex-col gap-2">
        {active.map((q) => {
          const pct = Math.min(100, (q.progress / q.target) * 100);
          const done = q.progress >= q.target;
          return (
            <button key={q.id} type="button" onClick={() => claim(q.id)} className="min-h-11 text-left">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-navy">{q.title}</span>
                <span className="tabular-nums text-muted">
                  {fmt(Math.min(q.progress, q.target))}/{fmt(q.target)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ice">
                <div className={`h-full rounded-full ${done ? "bg-success" : "bg-accent"}`} style={{ width: `${pct}%` }} />
              </div>
            </button>
          );
        })}
      </div>
      {active.some((q) => q.progress >= q.target) && (
        <div className="mt-2 text-[10px] font-semibold text-success">Fertige Aufträge antippen, um die Belohnung abzuholen.</div>
      )}
      <div className="mt-2 text-[10px] text-muted">
        Pisten {stats.pisteKm} km · Betten {stats.beds} · Kapazität {fmt(stats.liftCapacity)}/h
      </div>
    </Panel>
  );
}

/** Where it stands: the location factor and why, read off runs, stations and neighbours. */
function SiteRow({ id, itemId, q, r }: { id: string; itemId: string; q: number; r: number }) {
  const lifts = useStableGame((s) => s.lifts);
  const pistes = useStableGame((s) => s.pistes);
  const buildings = useStableGame((s) => s.buildings);
  const report = useMemo(
    () => siteAt(siteContext({ lifts, pistes, buildings }, getDem()), itemId, { q, r }, id),
    [lifts, pistes, buildings, itemId, q, r, id],
  );
  return (
    <div className="mt-2 rounded-[14px] bg-ice px-3 py-2 text-[12px] text-navy">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Lage</span>
        <span className={`value font-bold ${siteTone(report.factor)}`}>{pct(report.factor)}</span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-muted">
        {report.effects.length === 0
          ? "Ein gewöhnlicher Platz."
          : report.effects.map((e) => `${e.label} ${e.delta > 0 ? "+" : "−"}${Math.round(Math.abs(e.delta) * 100)} %`).join(" · ")}
      </p>
    </div>
  );
}

/**
 * «Mittelstation»: a stop part-way up, where guests get on and off and runs
 * can start or end. Three places along the line to choose from, and the runs
 * that come with it — top to stop, stop to valley, top to valley — each on or
 * off, laid out the way the piste assistant lays them out.
 */
const LEG_LABEL: Record<StationLeg, string> = {
  "top-mid": "Berg → Mitte",
  "mid-base": "Mitte → Tal",
  "top-base": "Berg → Tal",
};

function MidStationOffer({ liftId }: { liftId: string }) {
  const lifts = useStableGame((s) => s.lifts);
  const buildings = useStableGame((s) => s.buildings);
  const pistes = useStableGame((s) => s.pistes);
  const research = useStableGame((s) => s.research);
  const mix = useGame((s) => s.pisteMix);
  const money = useMyMoney().mine;
  // In thousands: takings change every second, and replanning every second
  // (the simulation, dozens of times) would make the panel stutter.
  const budgetK = Math.floor(money / 1000);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [legs, setLegs] = useState<StationLeg[] | null>(null);
  const spots = useMemo(() => {
    if (!open) return [];
    const all = midStationSpots({ ...useGame.getState(), lifts, buildings, pistes } as unknown as ResortState, getDem(), liftId);
    if (all.length <= 3) return all;
    return [all[Math.floor(all.length * 0.25)]!, all[Math.floor(all.length / 2)]!, all[Math.floor(all.length * 0.75)]!];
  }, [open, lifts, buildings, pistes, liftId]);
  const lift = lifts.find((l) => l.id === liftId);
  const stationCost = lift ? midStationCost({ ...useGame.getState(), research } as unknown as ResortState, lift.itemId) : 0;
  const spot = spots.length === 0 ? null : spots[pick ?? Math.floor((spots.length - 1) / 2)]!;
  const chosen = useMemo(
    () => legs ?? (open ? missingLegs({ ...useGame.getState(), lifts, pistes } as unknown as ResortState, getDem(), liftId) : []),
    [legs, open, lifts, pistes, liftId],
  );
  // The assistant's own way of picking lines: every grade asked for, plain
  // and with swings, judged by the simulation and the run's rating.
  // Worked out in the planner worker, so the panel answers taps meanwhile.
  const { result: planned, busy } = usePlanner<"station">(
    () =>
      open && spot
        ? {
            kind: "station",
            state: plannerState(useGame.getState(), { lifts, pistes, buildings, research }),
            liftId,
            mid: spot,
            legs: chosen,
            opts: { mix, budget: Math.max(0, budgetK * 1000 - stationCost) },
          }
        : null,
    [open, spot, chosen, mix, lifts, pistes, buildings, research, liftId, budgetK, stationCost],
  );
  const plan = open && spot ? planned : null;

  useEffect(() => {
    useGame.setState({ autoPreview: plan ? plan.runs.map((r) => ({ hexes: r.hexes, grade: r.grade })) : [] });
  }, [plan]);
  useEffect(() => () => useGame.setState({ autoPreview: [] }), []);

  if (!lift) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 flex min-h-11 items-center gap-1.5 text-[12px] font-semibold text-accent">
        <MapPin className="size-4" /> Mittelstation bauen
      </button>
    );
  }
  const labels = ["Weiter unten", "In der Mitte", "Weiter oben"];
  const toggle = (leg: StationLeg) => setLegs(chosen.includes(leg) ? chosen.filter((l) => l !== leg) : [...chosen, leg]);
  const total = stationCost + (plan?.cost ?? 0);
  const close = () => {
    setOpen(false);
    setPick(null);
    setLegs(null);
    useGame.setState({ autoPreview: [] });
  };
  const build = () => {
    if (!spot) return;
    useGame.getState().sendPlan([
      { type: "add_mid_station", liftId, q: spot.q, r: spot.r },
      ...(plan?.runs ?? []).map((r) => ({ type: "place_piste" as const, itemId: "piste" as const, hexes: r.hexes })),
    ]);
    play("build");
    close();
  };
  return (
    <div className="mt-2 rounded-[14px] bg-ice p-2.5 text-[12px] text-navy">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Mittelstation · {fmt(stationCost)}</span>
        <button type="button" onClick={close} aria-label="Schliessen" className="grid size-11 shrink-0 place-items-center rounded-full text-muted">
          <X className="size-4" />
        </button>
      </div>
      <p className="text-[11px] leading-snug text-muted">Gäste steigen unterwegs ein und aus, Pisten können dort beginnen und enden.</p>
      {spots.length === 0 ? (
        <p className="mt-1 text-[11px] text-warn">Auf dieser Linie ist kein Platz für eine Station – zu steil oder zu kurz.</p>
      ) : (
        <>
          <div className="mt-1.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${spots.length}, minmax(0, 1fr))` }}>
            {spots.map((h, i) => (
              <button
                key={`${h.q},${h.r}`}
                type="button"
                aria-pressed={spot === h}
                onClick={() => setPick(i)}
                className={`min-h-11 rounded-full px-2 text-[11px] font-bold ${spot === h ? "bg-accent text-panel" : "bg-panel text-navy"}`}
              >
                {spots.length === 3 ? labels[i] : `Platz ${i + 1}`}
              </button>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold">
            Pisten dazu
            {busy && <BusyNote />}
          </div>
          <div className="mt-1 flex gap-1">
            {MIXES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mix === m.id}
                onClick={() => useGame.setState({ pisteMix: m.id })}
                className={`min-h-11 flex-1 rounded-full text-[11px] font-semibold ${mix === m.id ? "bg-navy text-panel" : "bg-panel text-navy"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <ul className="mt-1 flex flex-col gap-1">
            {STATION_LEGS.map((leg) => {
              const on = chosen.includes(leg);
              const run = plan?.runs.find((r) => r.leg === leg);
              const miss = plan?.missed.find((m) => m.leg === leg);
              return (
                <li key={leg}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggle(leg)}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-[12px] px-2.5 text-left ${on ? "bg-panel" : "bg-panel/40 text-muted"}`}
                  >
                    <span className={`grid size-5 shrink-0 place-items-center rounded-md border-2 ${on ? "border-accent bg-accent text-panel" : "border-line"}`}>
                      {on && <Check className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{LEG_LABEL[leg]}</span>
                      {on && run && mix !== "mixed" && run.grade !== mix && (
                        <span className="block text-[10px] font-normal text-warn">Nur als {GRADE_LABEL[run.grade as keyof typeof GRADE_LABEL].toLowerCase()} Piste möglich</span>
                      )}
                    </span>
                    {on && run && (
                      <>
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: GRADE_COLOR[run.grade as keyof typeof GRADE_COLOR] }} aria-label={GRADE_LABEL[run.grade as keyof typeof GRADE_LABEL]} />
                        <RatingChip points={run.points} stars={starsFor(run.points)} />
                        <span className="value shrink-0 text-[11px]">{fmt(run.cost)}</span>
                      </>
                    )}
                    {on && miss && (
                      <span className="shrink-0 text-[10px] text-warn">{miss.reason === "budget" ? "Zu wenig Geld" : "Gelände lässt keine zu"}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={!spot || busy || money < total}
            onClick={build}
            className="btn-3d mt-2 flex h-11 w-full items-center justify-center gap-1 rounded-full bg-accent px-3 text-[12px] font-bold text-panel disabled:opacity-50"
            style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
          >
            {money < stationCost
              ? "Zu wenig Geld"
              : `Bauen${plan && plan.runs.length > 0 ? ` mit ${plan.runs.length} ${plan.runs.length === 1 ? "Piste" : "Pisten"}` : ""} · ${fmt(total)}`}
          </button>
          {plan && plan.runs.length > 0 && <p className="mt-1 text-center text-[10px] text-muted">Die Pisten sind auf der Karte gestrichelt</p>}
        </>
      )}
    </div>
  );
}

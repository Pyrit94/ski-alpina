import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import {
  Armchair,
  Bath,
  BedDouble,
  Building2,
  Bus,
  Cable,
  CableCar,
  Crown,
  Hotel,
  Mountain,
  Check,
  CloudSnow,
  Flame,
  FlaskConical,
  Gauge,
  GraduationCap,
  Handshake,
  Hourglass,
  IdCard,
  Landmark,
  Lock,
  Maximize2,
  Megaphone,
  MonitorDot,
  Moon,
  MountainSnow,
  RadioTower,
  ShieldCheck,
  Siren,
  Smartphone,
  Snowflake,
  Sparkles,
  TrainFront,
  Users,
  Warehouse,
  Wrench,
  X,
  Zap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  RESEARCH,
  RESEARCH_BRANCHES,
  RESEARCH_BY_ID,
  RESEARCH_NODES,
  researchCost,
  type ResearchBranchDef,
  type ResearchBranchId,
  type ResearchNodeDef,
} from "@ski/config";
import { isAllianceNode, nodeStatus, prerequisitesMet, researchEnabled, researchRate, type NodeStatus } from "@ski/shared";
import { fmt } from "@/lib/game/format";
import { peerColor } from "@/lib/game/players";
import { useGame } from "@/lib/game/store";

/**
 * The research tree ("Forschung"), including the alliance branch.
 *
 * Narrow (the 300 px desktop column, the phone sheet): one branch at a time,
 * picked with chips, laid out as a little tree. "Ganzer Baum" opens every
 * branch side by side in a wide overlay. Tapping a card opens its details and
 * the one button that matters for it — no hover anywhere.
 */

const ICONS: Record<string, LucideIcon> = {
  Armchair,
  Bath,
  BedDouble,
  Building2,
  Bus,
  Cable,
  CableCar,
  Crown,
  Hotel,
  Mountain,
  CloudSnow,
  Flame,
  Gauge,
  GraduationCap,
  Handshake,
  IdCard,
  Landmark,
  Megaphone,
  MonitorDot,
  Moon,
  MountainSnow,
  RadioTower,
  ShieldCheck,
  Siren,
  Smartphone,
  Snowflake,
  Sparkles,
  TrainFront,
  Warehouse,
  Wrench,
  Zap,
};

/** One picture per branch, so the categories read at a glance. */
const BRANCH_ICON: Record<string, LucideIcon> = {
  bahnen: CableCar,
  dorf: Hotel,
  pisten: MountainSnow,
  gaeste: Users,
  betrieb: Wrench,
  allianz: Handshake,
};

interface TeamMember {
  id: string;
  name: string;
}

/** Everything the panel needs from the store, in one place. */
function useResearch() {
  const research = useGame((s) => s.research);
  const match = useGame((s) => s.match);
  const stats = useGame((s) => s.stats);
  const coins = useGame((s) => s.coins);
  const players = useGame((s) => s.players);
  const playerId = useGame((s) => s.playerId);
  const playerName = useGame((s) => s.playerName);
  const team = useMemo<TeamMember[]>(() => {
    // The server asks the builders who are online; so does the screen.
    const online = players.filter((p) => p.role === "builder").map((p) => ({ id: p.id, name: p.name }));
    if (playerId && !online.some((p) => p.id === playerId)) online.unshift({ id: playerId, name: playerName });
    return online;
  }, [players, playerId, playerName]);
  const state = { research, match };
  return {
    research,
    match,
    coins,
    playerId,
    team,
    enabled: researchEnabled(state),
    rate: researchRate(state, stats),
    status: (id: string): NodeStatus => nodeStatus({ research }, id),
  };
}

type View = ReturnType<typeof useResearch>;

function nodesOf(branch: ResearchBranchId): ResearchNodeDef[] {
  return RESEARCH_NODES.filter((n) => n.branch === branch);
}

const STATUS_LABEL: Record<NodeStatus, string> = {
  done: "Erforscht",
  active: "Läuft",
  queued: "Als Nächstes",
  available: "Verfügbar",
  locked: "Gesperrt",
};

export function ResearchPanel({ compact = false }: { compact?: boolean }) {
  const view = useResearch();
  // A locked card in the build menu can ask for its node: open on it.
  const focus = useGame((s) => s.researchFocus);
  const [branch, setBranch] = useState<ResearchBranchId>(() => (focus ? (RESEARCH_BY_ID[focus]?.branch ?? "bahnen") : "bahnen"));
  const [selected, setSelected] = useState<string | null>(focus);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (focus) useGame.setState({ researchFocus: null });
  }, [focus]);

  if (!view.enabled) {
    return (
      <div className="rounded-[18px] bg-snow p-3 text-[12px] leading-snug text-muted">
        <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-navy">
          <FlaskConical className="size-4 text-accent" /> Forschung
        </div>
        In dieser Partie ist die Forschung ausgeschaltet. Im freien Spiel und in Partien mit Forschung sammelt ihr hier
        Forschungspunkte.
      </div>
    );
  }

  const selectedNode = selected ? RESEARCH_BY_ID[selected] : undefined;
  const branchDef = RESEARCH_BRANCHES.find((b) => b.id === branch)!;

  return (
    <div className={`flex flex-col ${compact ? "gap-2" : "gap-2.5"}`}>
      <ResearchHeader view={view} />

      {/* The categories as six tiles: a picture, the name, how far along,
          and a dot where something can be started now. */}
      <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Forschungsbereiche">
        {RESEARCH_BRANCHES.map((b) => {
          const active = b.id === branch;
          const nodes = nodesOf(b.id);
          const doneCount = nodes.filter((n) => view.research.done.includes(n.id)).length;
          const ready = nodes.some((n) => view.status(n.id) === "available");
          const Icon = BRANCH_ICON[b.id] ?? FlaskConical;
          return (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setBranch(b.id);
                setSelected(null);
              }}
              className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-[16px] px-1 py-1.5 text-center ring-2 transition-colors ${active ? "text-panel ring-transparent" : "bg-snow text-navy ring-line"}`}
              style={active ? { background: b.color } : undefined}
            >
              {ready && !active && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-success" aria-label="Etwas bereit" />}
              {b.alliance ? <AllianceMark team={view.team} small /> : <Icon className="size-5" />}
              <span className="text-[11px] font-bold leading-tight">{b.label}</span>
              <span className="mt-0.5 h-1 w-10 overflow-hidden rounded-full bg-black/10">
                <span className={`block h-full rounded-full ${active ? "bg-panel" : "bg-success"}`} style={{ width: `${(doneCount / Math.max(1, nodes.length)) * 100}%` }} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Where you are, with a step to the neighbouring categories. */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Vorheriger Bereich"
          onClick={() => {
            const i = RESEARCH_BRANCHES.findIndex((b) => b.id === branch);
            setBranch(RESEARCH_BRANCHES[(i + RESEARCH_BRANCHES.length - 1) % RESEARCH_BRANCHES.length]!.id);
            setSelected(null);
          }}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ice text-navy"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className={`min-w-0 flex-1 rounded-[14px] px-2.5 py-1.5 text-[11px] leading-snug ${branchDef.alliance ? "bg-success/10 text-success" : "bg-snow text-muted"}`}>
          <span className="font-bold text-navy">{branchDef.label}: </span>
          {branchDef.hint}
        </div>
        <button
          type="button"
          aria-label="Nächster Bereich"
          onClick={() => {
            const i = RESEARCH_BRANCHES.findIndex((b) => b.id === branch);
            setBranch(RESEARCH_BRANCHES[(i + 1) % RESEARCH_BRANCHES.length]!.id);
            setSelected(null);
          }}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ice text-navy"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <BranchTree branch={branchDef} view={view} selected={selected} onSelect={setSelected} />

      {selectedNode && <NodeDetail node={selectedNode} view={view} onClose={() => setSelected(null)} />}

      <button
        type="button"
        onClick={() => setWide(true)}
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-ice px-4 text-[12px] font-semibold text-navy"
      >
        <Maximize2 className="size-4" /> Ganzer Baum
      </button>

      {wide && <WideTree view={view} onClose={() => setWide(false)} />}
    </div>
  );
}

/** Points banked, points per day, and what is being worked on. */
function ResearchHeader({ view }: { view: View }) {
  const cancel = useGame((s) => s.cancelResearch);
  const boost = useGame((s) => s.boostResearch);
  const { research, match, rate } = view;
  const active = research.active ? RESEARCH_BY_ID[research.active.id] : undefined;
  const cost = active ? researchCost(active) : 0;
  const pct = active ? Math.min(100, (research.active!.progress / cost) * 100) : 0;
  const daysLeft = active && rate > 0 ? Math.ceil((cost - research.active!.progress) / rate) : null;
  const canBoost = !!active && view.coins >= RESEARCH.boost.coins;
  const inMatch = match.mode === "match";
  return (
    <div className="rounded-[18px] bg-gradient-to-br from-navy to-accent p-3 text-panel">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-soft">
            <FlaskConical className="size-3.5" /> Forschungspunkte
          </div>
          <div className="value text-[24px] font-bold leading-tight">{fmt(Math.floor(research.points))} FP</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-soft">pro Tag</div>
          <div className="value text-[16px] font-bold">≈ {rate.toFixed(1)}</div>
          {inMatch && <div className="text-[10px] text-ice/80">≈ {fmt(rate * match.daysPerRound)} pro Runde</div>}
        </div>
      </div>

      {active ? (
        <div className="mt-2 rounded-[14px] bg-panel/12 p-2">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="min-w-0 truncate font-semibold">{active.name}</span>
            <span className="value shrink-0 text-[11px] text-ice">
              {Math.floor(research.active!.progress)}/{cost} FP
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel/20">
            <div className="h-full rounded-full bg-coin transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-ice/80">
            {daysLeft !== null ? `noch ≈ ${daysLeft} ${daysLeft === 1 ? "Tag" : "Tage"}` : "wartet auf Gäste"}
            {inMatch && daysLeft !== null ? ` · Runde dauert ${match.daysPerRound} Tage` : ""}
          </div>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              disabled={!canBoost}
              onClick={boost}
              className="flex min-h-11 flex-1 flex-col items-center justify-center rounded-[16px] bg-coin px-3 py-1 text-navy disabled:opacity-50"
            >
              <span className="text-[12px] font-bold leading-tight">Mit Geld beschleunigen</span>
              <span className="value text-[10px] font-semibold leading-tight">
                +{RESEARCH.boost.points} FP für {fmt(RESEARCH.boost.coins)} CHF
              </span>
            </button>
            <button
              type="button"
              onClick={() => cancel()}
              className="min-h-11 shrink-0 rounded-full bg-panel/15 px-3 text-[12px] font-semibold text-panel"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 rounded-[14px] bg-panel/12 px-2.5 py-2 text-[12px] text-ice">
          Nichts in Arbeit. Tippe auf eine Karte und wähle «Erforschen» – gesammelte Punkte fliessen sofort hinein.
        </div>
      )}

      {research.queue.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
          <span className="text-ice/80">Danach:</span>
          {research.queue.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => cancel(id)}
              aria-label={`${RESEARCH_BY_ID[id]?.name ?? id} aus der Warteschlange nehmen`}
              className="flex min-h-9 items-center gap-1 rounded-full bg-panel/15 pl-2.5 pr-1.5 font-semibold"
            >
              {RESEARCH_BY_ID[id]?.name ?? id}
              <X className="size-3.5 opacity-80" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Two little faces: this needs all of you. */
function AllianceMark({ team, small = false }: { team: TeamMember[]; small?: boolean }) {
  const shown = team.slice(0, 3);
  const size = small ? "size-4 text-[8px]" : "size-6 text-[10px]";
  return (
    <span className="flex -space-x-1.5">
      {(shown.length >= 2 ? shown : [...shown, { id: "partner", name: "?" }]).map((m) => (
        <span
          key={m.id}
          className={`grid ${size} place-items-center rounded-full border border-panel font-bold text-panel`}
          style={{ background: m.id === "partner" ? "#7C8DA6" : peerColor(m.id) }}
        >
          {m.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
    </span>
  );
}

const CARD_H = 90;
const ROW_GAP = 26;
const COL_GAP = 8;

/** One branch as a small tree: rows by tier, lines to the prerequisites. */
function BranchTree({
  branch,
  view,
  selected,
  onSelect,
  width,
}: {
  branch: ResearchBranchDef;
  view: View;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Fixed width in px; otherwise the container's. */
  width?: number;
}) {
  const nodes = nodesOf(branch.id);
  const [measured, setMeasured] = useState(276);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el || width) return;
    const ro = new ResizeObserver(() => setMeasured(el.clientWidth));
    ro.observe(el);
    setMeasured(el.clientWidth);
    return () => ro.disconnect();
  }, [el, width]);
  const w = width ?? measured;

  const tiers = [...new Set(nodes.map((n) => n.tier))].sort((a, b) => a - b);
  const maxPerRow = Math.max(...tiers.map((t) => nodes.filter((n) => n.tier === t).length));
  const cardW = Math.max(96, (w - COL_GAP * (maxPerRow - 1)) / maxPerRow);
  const pos = new Map<string, { x: number; y: number }>();
  tiers.forEach((tier, row) => {
    const inRow = nodes.filter((n) => n.tier === tier);
    const rowW = inRow.length * cardW + (inRow.length - 1) * COL_GAP;
    const x0 = (w - rowW) / 2;
    inRow.forEach((n, i) => pos.set(n.id, { x: x0 + i * (cardW + COL_GAP), y: row * (CARD_H + ROW_GAP) }));
  });
  const height = tiers.length * CARD_H + (tiers.length - 1) * ROW_GAP;

  return (
    <div ref={setEl} className="relative w-full" style={{ height, width: width ?? undefined }}>
      <svg className="pointer-events-none absolute inset-0" width={w} height={height} aria-hidden>
        {nodes.flatMap((n) =>
          n.requires.map((req) => {
            const a = pos.get(req);
            const b = pos.get(n.id);
            if (!a || !b) return null;
            const x1 = a.x + cardW / 2;
            const y1 = a.y + CARD_H;
            const x2 = b.x + cardW / 2;
            const y2 = b.y;
            const lit = view.research.done.includes(req);
            const mid = (y1 + y2) / 2;
            return (
              <path
                key={`${req}-${n.id}`}
                d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
                fill="none"
                stroke={lit ? branch.color : "#d7e4f0"}
                strokeWidth={lit ? 3 : 2}
                strokeDasharray={lit ? undefined : "4 4"}
                strokeLinecap="round"
              />
            );
          }),
        )}
      </svg>
      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        return (
          <NodeCard
            key={n.id}
            node={n}
            branch={branch}
            view={view}
            selected={selected === n.id}
            onSelect={() => onSelect(selected === n.id ? null : n.id)}
            style={{ left: p.x, top: p.y, width: cardW, height: CARD_H }}
          />
        );
      })}
    </div>
  );
}

function NodeCard({
  node,
  branch,
  view,
  selected,
  onSelect,
  style,
}: {
  node: ResearchNodeDef;
  branch: ResearchBranchDef;
  view: View;
  selected: boolean;
  onSelect: () => void;
  style: CSSProperties;
}) {
  const status = view.status(node.id);
  const Icon = ICONS[node.icon] ?? FlaskConical;
  const cost = researchCost(node);
  const alliance = isAllianceNode(node);
  const pledged = view.research.pledges[node.id] ?? [];
  const progress = status === "active" ? (view.research.active?.progress ?? 0) / cost : 0;
  const queuePos = view.research.queue.indexOf(node.id);

  const tone =
    status === "done"
      ? "bg-success/12 text-navy"
      : status === "active"
        ? "bg-panel text-navy ring-2 ring-accent"
        : status === "queued"
          ? "bg-panel text-navy ring-2 ring-accent/45"
          : status === "available"
            ? "bg-panel text-navy shadow-[var(--shadow-chip)]"
            : "bg-snow text-subtle";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`absolute flex flex-col overflow-hidden rounded-[16px] p-2 text-left transition-transform duration-150 active:scale-[0.97] ${tone} ${selected ? "outline outline-2 outline-offset-2 outline-navy" : ""} ${alliance && status !== "done" ? "border-2 border-success/50" : "border border-line"}`}
      style={style}
    >
      <span className="flex items-center justify-between gap-1">
        <span
          className="grid size-6 shrink-0 place-items-center rounded-[8px] text-panel"
          style={{ background: status === "locked" ? "#b9c6d6" : status === "done" ? "#34A853" : branch.color }}
        >
          {status === "done" ? <Check className="size-3.5" /> : status === "locked" ? <Lock className="size-3" /> : <Icon className="size-3.5" />}
        </span>
        <span className="flex min-w-0 items-center gap-1">
          {alliance && status !== "done" && (
            <span className="flex -space-x-1">
              {view.team.slice(0, 3).map((m) => (
                <span
                  key={m.id}
                  className={`grid size-4 place-items-center rounded-full border border-panel text-[8px] font-bold text-panel ${pledged.includes(m.id) ? "" : "opacity-35"}`}
                  style={{ background: peerColor(m.id) }}
                >
                  {pledged.includes(m.id) ? "✓" : m.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </span>
          )}
          <span className="truncate text-[10px] font-semibold">
            {status === "done"
              ? "Erforscht"
              : status === "active"
                ? `${Math.round(progress * 100)} %`
                : status === "queued"
                  ? `#${queuePos + 1}`
                  : `${cost} FP`}
          </span>
        </span>
      </span>
      <span lang="de" className="mt-1.5 line-clamp-2 hyphens-auto text-[11px] font-semibold leading-[1.2] [overflow-wrap:anywhere]">
        {node.name}
      </span>
      <span className="mt-auto truncate text-[9px] font-medium opacity-75">
        {status === "active"
          ? "läuft"
          : status === "queued"
            ? "als Nächstes"
            : status === "locked"
              ? "gesperrt"
              : status === "available"
                ? prerequisitesMet(view.research, node)
                  ? "verfügbar"
                  : "danach planbar"
                : node.effectText}
      </span>
      {status === "active" && (
        <span className="absolute inset-x-0 bottom-0 h-1 bg-accent/15">
          <span className="block h-full bg-accent" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </span>
      )}
    </button>
  );
}

/** What the node does, what it needs, and the button for it. */
function NodeDetail({ node, view, onClose }: { node: ResearchNodeDef; view: View; onClose: () => void }) {
  const start = useGame((s) => s.startResearch);
  const cancel = useGame((s) => s.cancelResearch);
  const pledge = useGame((s) => s.pledgeResearch);
  const status = view.status(node.id);
  const branch = RESEARCH_BRANCHES.find((b) => b.id === node.branch)!;
  const Icon = ICONS[node.icon] ?? FlaskConical;
  const cost = researchCost(node);
  const alliance = isAllianceNode(node);
  const pledged = view.research.pledges[node.id] ?? [];
  const missing = view.team.filter((m) => !pledged.includes(m.id));
  const iPledged = !!view.playerId && pledged.includes(view.playerId);
  const busy = !!view.research.active;
  const queueFull = busy && view.research.queue.length >= RESEARCH.queueMax;
  const verb = busy ? "In die Warteschlange" : "Erforschen";
  // Below a tall tree on a phone, a detail that opens off-screen looks like nothing happened.
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    box?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [box, node.id]);

  let action: ReactNode = null;
  const primary =
    "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-bold text-panel disabled:opacity-50";
  if (status === "done") {
    action = (
      <div className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-success/12 text-[13px] font-semibold text-success">
        <Check className="size-4" /> Erforscht
      </div>
    );
  } else if (status === "active") {
    action = (
      <button type="button" onClick={() => cancel()} className={`${primary} bg-danger/85`}>
        Abbrechen – Punkte zurück
      </button>
    );
  } else if (status === "queued") {
    action = (
      <button type="button" onClick={() => cancel(node.id)} className={`${primary} bg-navy`}>
        Aus der Warteschlange nehmen
      </button>
    );
  } else if (status === "locked") {
    action = (
      <div className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-snow px-3 text-center text-[12px] font-semibold text-subtle">
        <Lock className="size-4" /> Zuerst {node.requires.map((r) => RESEARCH_BY_ID[r]?.name ?? r).join(" und ")}
      </div>
    );
  } else if (alliance && missing.length > 0) {
    action = iPledged ? (
      <div className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-success/12 px-3 text-center text-[12px] font-semibold text-success">
        <Hourglass className="size-4" /> Zugesagt – wartet auf {missing.map((m) => m.name).join(" und ")}
      </div>
    ) : (
      <button type="button" onClick={() => pledge(node.id)} className={`${primary} bg-success`}>
        <Handshake className="size-4" /> Unterstützen
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        disabled={queueFull}
        onClick={() => start(node.id)}
        className={`${primary} bg-accent`}
      >
        <FlaskConical className="size-4" /> {queueFull ? "Warteschlange voll" : verb}
      </button>
    );
  }

  return (
    <div ref={setBox} className={`rounded-[18px] border p-3 ${alliance ? "border-success/40 bg-success/5" : "border-line bg-panel"}`}>
      <div className="flex items-start gap-2.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-[12px] text-panel" style={{ background: branch.color }}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            {branch.label} · Stufe {node.tier} · {STATUS_LABEL[status]}
          </div>
          <div className="text-[15px] font-bold leading-tight text-navy">{node.name}</div>
        </div>
        <button
          type="button"
          aria-label="Schliessen"
          onClick={onClose}
          className="-mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-muted"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2 rounded-[12px] bg-ice px-2.5 py-1.5 text-[12px] font-semibold text-navy">{node.effectText}</div>
      <p className="mt-1.5 text-[12px] leading-snug text-muted">{node.blurb}</p>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
        <span>
          Kosten <span className="value font-bold text-navy">{cost} FP</span>
        </span>
        {node.requires.length > 0 && (
          <span className="truncate pl-2">
            braucht {node.requires.map((r) => RESEARCH_BY_ID[r]?.name ?? r).join(", ")}
          </span>
        )}
      </div>
      {alliance && status !== "done" && (
        <div className="mt-2 rounded-[12px] bg-panel p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-success">
            <Handshake className="size-3.5" /> Allianz: alle Spieler müssen zusagen
          </div>
          <ul className="flex flex-col gap-1">
            {view.team.map((m) => {
              const yes = pledged.includes(m.id);
              return (
                <li key={m.id} className="flex items-center gap-2 text-[12px]">
                  <span
                    className="grid size-6 place-items-center rounded-full text-[10px] font-bold text-panel"
                    style={{ background: peerColor(m.id) }}
                  >
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-navy">
                    {m.name}
                    {m.id === view.playerId ? " (du)" : ""}
                  </span>
                  <span className={`text-[11px] font-semibold ${yes ? "text-success" : "text-warn"}`}>
                    {yes ? "zugesagt" : "wartet"}
                  </span>
                </li>
              );
            })}
          </ul>
          {view.team.length < 2 && (
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Gerade bist du allein online – deine Zusage reicht. Zu zweit braucht es beide.
            </p>
          )}
        </div>
      )}
      <div className="mt-2.5">{action}</div>
    </div>
  );
}

/** Every branch side by side, for a screen that has room for it. */
function WideTree({ view, onClose }: { view: View; onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedNode = selected ? RESEARCH_BY_ID[selected] : undefined;
  const COLUMN = 236;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // A portal: the panels around this use backdrop blur, which would make a
  // fixed overlay inside them fixed to the panel instead of the screen.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-2 sm:p-6" role="dialog" aria-label="Forschungsbaum">
      <button type="button" aria-label="Schliessen" className="absolute inset-0" onClick={onClose} />
      <div className="pop-in relative flex max-h-full w-full max-w-[1320px] flex-col overflow-hidden rounded-[24px] bg-panel shadow-[var(--shadow-panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2 text-[16px] font-bold text-navy">
            <FlaskConical className="size-5 text-accent" /> Forschungsbaum
          </div>
          <div className="flex items-center gap-3 text-[12px] text-muted">
            <span>
              <span className="value text-[15px] font-bold text-navy">{fmt(Math.floor(view.research.points))} FP</span> auf der Bank
            </span>
            <span className="hidden sm:inline">≈ {view.rate.toFixed(1)} FP/Tag</span>
            <button
              type="button"
              aria-label="Schliessen"
              onClick={onClose}
              className="grid size-11 place-items-center rounded-full text-muted hover:bg-snow"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="flex gap-4" style={{ width: RESEARCH_BRANCHES.length * (COLUMN + 16) }}>
            {RESEARCH_BRANCHES.map((b) => (
              <div key={b.id} className="flex flex-col gap-2" style={{ width: COLUMN }}>
                <div
                  className={`flex min-h-12 items-center justify-between rounded-[14px] px-3 py-1.5 ${b.alliance ? "bg-success/12" : "bg-snow"}`}
                >
                  <div>
                    <div className="text-[13px] font-bold" style={{ color: b.alliance ? "#1f7a3a" : "#16305C" }}>
                      {b.label}
                    </div>
                    <div className="text-[10px] leading-tight text-muted">{b.hint}</div>
                  </div>
                  {b.alliance && <AllianceMark team={view.team} />}
                </div>
                <BranchTree branch={b} view={view} selected={selected} onSelect={setSelected} width={COLUMN} />
              </div>
            ))}
          </div>
        </div>
        {selectedNode && (
          <div className="border-t border-line bg-snow p-3">
            <div className="mx-auto max-w-[560px]">
              <NodeDetail node={selectedNode} view={view} onClose={() => setSelected(null)} />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

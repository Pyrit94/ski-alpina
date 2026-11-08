import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  BarChart3,
  MessageCircle,
  Cloud,
  CloudFog,
  CloudLightning,
  Flag,
  Lock,
  Sun,
  Bus,
  Cable,
  Check,
  ChevronRight,
  Gem,
  Hammer,
  Hotel,
  ListChecks,
  Mountain,
  RotateCw,
  Snowflake,
  Star,
  Store,
  Trash2,
  Trees,
  Utensils,
  X,
  FlaskConical,
  Settings,
  Smile,
  Sparkles,
  Users,
} from "lucide-react";
import { peerColor } from "@/lib/game/players";
import { useIsDesktop } from "@/lib/game/use-breakpoint";
import { BY_ID, CATALOG, CATEGORIES, ECONOMY, FLOW, GRADE_LABEL, SEASON_LABEL, UPGRADES, isLift, levelFromXp, liftThroughput, seasonPhase, xpForLevel } from "@/lib/game/catalog";
import type { CatalogItem } from "@/lib/game/catalog";
import { BUILDING_LEVELS, PISTE_LEVELS, TERRAIN } from "@ski/config";
import { buildingLevel, expandable, expansionCost, expansionSpent, PENDING_READY, pisteExpandable, pisteExpansionCost, pisteExpansionSpent, pisteLevel, widthDef } from "@ski/shared";
import { buildingLevelLabel, levelGain, pisteLevelLabel } from "@/lib/game/expansion";
import { GRADE_COLOR, usePisteEditor } from "@/lib/game/piste-editor";
import { fmt, fmtCompact, fmtSigned } from "@/lib/game/format";
import { exportSave } from "@/lib/game/save";
import { useCardImages } from "@/lib/game/card-images";
import { play, setSoundEnabled, soundEnabled } from "@/lib/game/sound";
import { ChatPanel, MarkButtons, MarkHint, UnreadBadge } from "./TeamHUD";
import { ResearchPanel } from "./ResearchHUD";
import { DuelStandings, MatchRulesPanel, MyPurseChip, RoleChooser, SecretGoalCard, VipCard, WalletPanel } from "./RulesHUD";
import { useMyMoney } from "@/lib/game/team";
import { DescentButton, DescentOffer, LinkStatus } from "./LinkStatus";
import { AutoPistesButton, AutoPistesPanel } from "./AutoPistes";
import { openAutoPistes } from "@/lib/game/auto-pistes";
import { SavesPanel } from "./SavesPanel";
import { useResearchReady } from "@/lib/game/research-ready";
import { realMetres } from "@/lib/game/real-height";
import { NextStepChip } from "./NextStepChip";
import { LIFT_LINK_TEXT, useResortLinks } from "@/lib/game/links";
import { PisteEditPanel, PisteEditor } from "./PisteEditor";
import { useUnreadChat } from "@/lib/game/team";
import { useBuildTerms } from "@/lib/game/research";
import { Celebration, EventCard, FinalScreen, MatchGoalsPanel, MatchSetupModal, RoundBar, RoundReportModal, Toasts } from "./MatchHUD";
import { useGame } from "@/lib/game/store";
import type { Category, HudSheet, ItemId, MapLayer, PlacedPiste } from "@/lib/game/types";

function PlayersLine() {
  const players = useGame((s) => s.players);
  const connected = useGame((s) => s.connected);
  const me = useGame((s) => s.playerId);
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <span className={`size-2 rounded-full ${connected ? "bg-success" : "bg-warn"}`} />
        {connected ? `${Math.max(1, players.length)} online` : "Verbinde…"}
      </div>
      <div className="flex flex-wrap gap-1">
        {players.map((p) => (
          // The chip colour matches this player's ring on the mountain, which
          // is what ties a name to the work happening under it.
          <span
            key={p.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-snow px-2 py-0.5 text-[11px] font-medium text-navy"
          >
            <span className="size-2 rounded-full" style={{ background: peerColor(p.id) }} />
            {p.name}
            {p.id === me && <span className="text-muted">(du)</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Minutes-ago, in the shortest form that is still honest. */
function sinceLabel(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "gerade";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`;
}

/**
 * What has happened in this resort, and who did it.
 *
 * Events were broadcast and forgotten: coming back after an hour told you
 * nothing about what your partner had changed, and no event named its author.
 * The log lives in the save, so it survives a reload and a restart.
 */
function ActivityPanel() {
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

function Coin({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#F4B942" />
      <circle cx="12" cy="12" r="7.2" fill="#ffe08a" />
      <path d="M12 7.2v9.6M9.2 9.4c.6-1 2.6-1.2 3.6-.2.8.8.7 2.1-.3 2.7-1 .6-2.6.5-3.3 1.4-.5.6 0 1.8 1.6 2.1 1.4.3 2.7-.3 3.2-1.1" stroke="#b8860b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Category names that fit under a round button on a phone. */
const SHORT_CAT: Partial<Record<Category, string>> = { lifts: "Bahnen", deco: "Deko" };

const CAT_ICON: Record<Category, typeof Cable> = {
  lifts: Cable,
  buildings: Hotel,
  pistes: Mountain,
  deco: Trees,
  services: Store,
};

/**
 * The price to show in a list.
 *
 * A piste no longer has one price: gentle ground is cheap to cut and steep
 * ground is not, so the catalogue figure is a floor rather than a quote. The
 * real number appears while drawing, in the piste editor.
 */
function priceLabel(item: { id: ItemId; cost: number }): string {
  return item.id === "piste" ? `ab ${fmt(item.cost)}` : fmt(item.cost);
}

const ITEM_ICON: Partial<Record<ItemId, typeof Cable>> = {
  gondola: Cable,
  chair: Cable,
  tbar: Cable,
  tram: Cable,
  restaurant: Utensils,
  hut: Hotel,
  hotel1: Hotel,
  hotel3: Hotel,
  hotel5: Hotel,
  shop: Store,
  parking: Bus,
  groomer: Hammer,
  viewpoint: Mountain,
};

export function GameHUD() {
  // The wide columns are not rendered at all on a phone, rather than rendered
  // and hidden: `hidden lg:flex` still mounts them, subscribes every selector
  // inside and re-renders all of it on every tick, for pixels nobody sees.
  const desktop = useIsDesktop();
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col text-ink">
      <TopBar />
      <div className="relative min-h-0 flex-1">
        <div className="flex h-full">
          <div className="relative min-w-0 flex-1">
            {desktop && (
              <div className="absolute inset-x-0 top-2 z-10 flex flex-col items-center gap-2 px-3">
                <RoundBar />
                <MarkHint />
                <RoleChooser />
                <EventCard />
                <BuildHint />
                <PisteEditor />
                <AutoPistesPanel />
                <DescentOffer />
                <NextStepChip />
              </div>
            )}
            {!desktop && <BuildHint />}
            {desktop && <CenterTools />}
            {desktop && <Attribution />}
            <ActionRail />
            {desktop && <DesktopPanel />}
            {desktop && <DesktopCorners />}
            {!desktop && <MobileFloats />}
            {!desktop && (
              <div className="absolute inset-x-0 top-3 z-20 flex justify-center px-16">
                <MarkHint />
              </div>
            )}
          </div>
        </div>
      </div>
      <BuildReticle />
      {!desktop && (
        <>
          <MobileDock />
          <MobileSheets />
        </>
      )}
      <BuildDrawer />
      <div className="absolute left-1/2 top-[4.25rem] z-40 -translate-x-1/2 lg:left-auto lg:right-24 lg:translate-x-0">
        <Toasts />
      </div>
      <MatchSetupModal />
      <RoundReportModal />
      <FinalScreen />
      <Celebration />
    </div>
  );
}

/**
 * A photo for an item when Get-Textures.ps1 has fetched one, else its icon.
 * A photo that fails to load falls back to the icon too.
 */
function ItemThumb({ id, className, iconClass = "size-4" }: { id: ItemId; className: string; iconClass?: string }) {
  const images = useCardImages();
  const [broken, setBroken] = useState(false);
  const item = BY_ID[id];
  const img = images[id];
  if (img && !broken) {
    return <img src={img.url} alt="" title={img.title} onError={() => setBroken(true)} className={`${className} object-cover`} />;
  }
  const Icon = ITEM_ICON[id] ?? CAT_ICON[item.category];
  return (
    <span className={`${className} grid place-items-center bg-ice`} style={{ color: item.color }}>
      <Icon className={iconClass} />
    </span>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`pointer-events-auto rounded-[22px] bg-panel/92 shadow-[var(--shadow-panel)] backdrop-blur-md ${className}`}>
      {children}
    </div>
  );
}

function TopBar() {
  const gems = useGame((s) => s.gems);
  const stars = useGame((s) => s.stars);
  const season = useGame((s) => s.season);
  const day = useGame((s) => s.day);
  const weather = useGame((s) => s.weather);
  const resortName = useGame((s) => s.resortName);
  const WeatherIcon = weather.kind === "snow" ? Snowflake : weather.kind === "sun" ? Sun : weather.kind === "storm" ? CloudLightning : weather.kind === "fog" ? CloudFog : Cloud;
  return (
    <header
      className="pointer-events-auto flex items-center gap-2 px-3 lg:px-4"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div className="flex shrink-0 items-center gap-2 rounded-full bg-panel/92 py-1 pl-1 pr-2.5 shadow-[var(--shadow-chip)] lg:pr-4">
        <LogoMark />
        <div className="hidden leading-tight sm:block">
          <div className="text-[13px] font-bold tracking-wide text-navy lg:text-[15px]">SKI ALPINA</div>
          <div className="hidden max-w-[10rem] truncate text-[10px] font-medium text-muted lg:block">{resortName}</div>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-x-auto lg:justify-center lg:gap-2">
        <MyPurseChip coin={<Coin />} />
        <Currency n={gems} icon={<Gem className="size-4 text-gem" />} label="Edelsteine" />
        <span className="hidden lg:contents">
          <Currency n={stars} icon={<Star className="size-4 fill-star text-star" />} label="Prestige: jeder Stern +1 % Gäste" />
        </span>
        <GuestsChip />
        <LevelChip />
        <div className="hidden items-center gap-2 rounded-full bg-panel/92 px-3 py-1.5 text-[11px] font-medium text-muted shadow-[var(--shadow-chip)] lg:flex">
          <WeatherIcon className="size-3.5 text-accent" />
          {weather.label} · {weather.tempC}°
          <span className="text-subtle">· S{season} T{day}</span>
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
        <Avatars />
      </div>
    </header>
  );
}

/**
 * Guests and how happy they are, up top where a city builder shows its
 * population and happiness. Tapping opens Betrieb.
 */
function GuestsChip() {
  const guests = useGame((s) => s.stats.guestsPerHour);
  const happy = useGame((s) => s.stats.satisfaction);
  const setSheet = useGame((s) => s.setSheet);
  const tone = happy < 55 ? "text-danger" : happy < 75 ? "text-warn" : "text-success";
  return (
    <button
      type="button"
      onClick={() => setSheet("info")}
      aria-label={`${guests} Gäste pro Stunde, ${happy} % zufrieden`}
      className="value flex shrink-0 items-center gap-1.5 rounded-full bg-panel/92 px-2.5 py-1.5 text-[12px] font-bold text-navy shadow-[var(--shadow-chip)]"
    >
      <Users className="size-3.5 text-accent" />
      {fmtCompact(guests)}
      <Smile className={`size-3.5 ${tone}`} />
      <span className={tone}>{happy}%</span>
    </button>
  );
}

/** Level and progress to the next, as a ring around the number. */
function LevelChip() {
  const xp = useGame((s) => s.xp);
  const lvl = levelFromXp(xp);
  const next = xpForLevel(lvl + 1);
  const prev = xpForLevel(lvl);
  const pct = Math.min(1, (xp - prev) / Math.max(1, next - prev));
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="flex items-center gap-1.5 rounded-full bg-panel/92 py-1 pl-1 pr-2.5 shadow-[var(--shadow-chip)]"
      title={`Level ${lvl}: ${fmt(xp)} / ${fmt(next)} XP`}
    >
      <svg viewBox="0 0 28 28" className="size-7">
        <circle cx="14" cy="14" r={r} fill="var(--color-ice)" stroke="var(--color-line)" strokeWidth="3" />
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 14 14)"
        />
        <text x="14" y="18" textAnchor="middle" className="fill-navy text-[11px] font-bold">
          {lvl}
        </text>
      </svg>
      <span className="hidden text-[11px] font-semibold text-navy lg:inline">Level</span>
    </div>
  );
}

/** Who is here, in the colour their ring has on the mountain. */
function Avatars() {
  const players = useGame((s) => s.players);
  const me = useGame((s) => s.playerId);
  const ready = useGame((s) => s.match.ready);
  if (players.length === 0) return null;
  return (
    <div className="flex items-center -space-x-1.5 rounded-full bg-panel/92 py-1 pl-1 pr-2 shadow-[var(--shadow-chip)]">
      {players.slice(0, 4).map((p) => (
        <span
          key={p.id}
          title={`${p.name}${p.id === me ? " (du)" : ""}${ready.includes(p.id) ? " · bereit" : ""}`}
          className="relative grid size-7 place-items-center rounded-full text-[11px] font-bold text-panel ring-2 ring-panel"
          style={{ background: peerColor(p.id) }}
        >
          {p.name.slice(0, 1).toUpperCase()}
          {ready.includes(p.id) && (
            <span className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-success ring-2 ring-panel">
              <Check className="size-2.5 text-panel" />
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0B1F3A" />
      <path d="M4 22 L12 10 L18 18 L22 12 L28 22 Z" fill="#E8F3FB" />
      <path d="M12 10 L18 18 L8 22 Z" fill="#1A73E8" />
      <circle cx="22" cy="9" r="1.4" fill="#F5D76E" />
    </svg>
  );
}

/**
 * A currency pill.
 *
 * The most-looked-at number on the screen, so it gets the weight: the count is
 * bold and tabular, and the icon sits in its own recessed well rather than
 * floating next to the digits. Tabular figures matter here — a balance that
 * jitters as it ticks is distracting in the corner of the eye.
 */
function Currency({ n, icon, label }: { n: number; icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-panel/92 py-1 pl-1 pr-2.5 shadow-[var(--shadow-chip)]" title={label}>
      <span className="grid size-6 place-items-center rounded-full bg-ice shadow-[inset_0_1px_2px_rgba(11,31,58,.12)]">
        {icon}
      </span>
      <span className="value min-w-[1.7rem] text-right text-[13px] font-bold text-navy lg:min-w-[3rem] lg:text-[14px]">
        <span className="lg:hidden">{fmtCompact(n)}</span>
        <span className="hidden lg:inline">{fmt(n)}</span>
      </span>
    </div>
  );
}



/** Copernicus attribution, required wherever the terrain is shown. */
function Attribution() {
  return (
    <div className="pointer-events-auto absolute bottom-2 left-24 z-10 max-w-[18rem] text-[9px] leading-tight text-navy/60">
      {TERRAIN.attribution}
    </div>
  );
}

function LayerTabs() {
  const layer = useGame((s) => s.layer);
  const setLayer = useGame((s) => s.setLayer);
  const tabs: { id: MapLayer; label: string }[] = [
    { id: "3d", label: "Gelände" },
    { id: "height", label: "Höhen" },
    { id: "pistes", label: "Pisten" },
    { id: "heat", label: "Auslastung" },
  ];
  return (
    <div className="grid grid-cols-4 gap-1 rounded-full bg-panel/92 p-1 shadow-[var(--shadow-chip)]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setLayer(t.id)}
          className={`min-h-9 whitespace-nowrap rounded-full px-2 text-[11px] font-semibold ${layer === t.id ? "bg-accent text-panel" : "text-navy hover:bg-snow"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function InfoPanel() {
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
  const lift = lifts.find((l) => l.id === selectedId || l.stationA === selectedId || l.stationB === selectedId);
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
          <div className="mt-0.5 inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
            Level {entity.level}
          </div>
        </div>
      </div>
      {constructing && (
        <div className="mt-2 text-[11px] text-warn">{pendingRound ? "Wird bis Ende der Runde fertig." : "Im Bau…"}</div>
      )}
      <BuiltByLine builtBy={entity.builtBy} />
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
      {lift && <AutoPistesButton liftId={lift.id} className="mt-2 w-full" />}
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
                  <div className="text-[11px] font-semibold text-navy">Lv. {lv}</div>
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

/** Below this share of its capacity a lift reads as nearly empty. */
const LOW_USE = 0.25;

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

/** What a demolition pays back, mirroring the server's share of the build price. */
function refundFor(cost: number) {
  return Math.floor(cost * ECONOMY.demolishRefund);
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
function OperationsPanel() {
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
    </Panel>
  );
}

/**
 * The day ticket price, the one lever that acts every day.
 *
 * Kept local while dragging and sent once on release, so a slide does not
 * become forty intents and forty activity entries.
 */
function TicketPricePanel() {
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
function RenamePanel() {
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

function Warning({ tone, children }: { tone: "warn" | "bad"; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-[12px] px-2 py-1.5 text-[11px] leading-snug ${
        tone === "bad" ? "bg-danger/10 text-danger" : "bg-warn/12 text-warn"
      }`}
    >
      {children}
    </p>
  );
}

/**
 * One number with its label.
 *
 * The value was the same weight as its caption, so a panel of these read as a
 * paragraph rather than as a readout. The number now carries the tile: bigger,
 * darker, tabular, with the label demoted to a small line above it. `tone`
 * colours the number itself, because a negative figure should be legible as
 * bad without reading the words.
 */
function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-success"
      : tone === "warn"
        ? "text-warn"
        : tone === "bad"
          ? "text-danger"
          : "text-navy";
  return (
    <div className="rounded-[14px] bg-snow px-1.5 py-2 shadow-[inset_0_0_0_1px_rgba(11,31,58,.05)]">
      <div className="text-[9px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className={`value mt-0.5 text-[15px] font-bold leading-none ${color}`}>{value}</div>
    </div>
  );
}

function Quests() {
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

function BuildHint() {
  const buildItem = useGame((s) => s.buildItem);
  const phase = useGame((s) => s.phase);
  const hover = useGame((s) => s.hover);
  const stampMode = useGame((s) => s.stampMode);
  // Drawing a run has its own editor card (PisteEditor.tsx).
  if (!buildItem || phase === "idle" || phase === "piste") return null;
  const item = BY_ID[buildItem];
  const msg =
    phase === "lift-a"
      ? stampMode
        ? "Karte unter das Raster schieben — erste Station"
        : "Talstation tippen"
      : phase === "lift-b"
        ? stampMode
          ? "Gegenstation unter das Raster schieben"
          : "Bergstation tippen"
        : hover?.reason || (stampMode ? "Karte schieben, Raster zielen, Setzen" : "Feld tippen zum Bauen");
  return (
    <div className="pointer-events-none z-10 w-[min(92%,300px)] rounded-[16px] bg-panel/95 p-3 text-center shadow-[var(--shadow-panel)] max-lg:absolute max-lg:left-1/2 max-lg:top-2 max-lg:-translate-x-1/2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-navy">{item.name}</div>
      <div className="mt-1 text-[12px] text-muted">{msg}</div>
      {item.capacity ? (
        <div className="value mt-1 text-[13px] font-bold text-success">
          Kapazität {fmt(item.capacity)} Pers./h
        </div>
      ) : null}
    </div>
  );
}

/**
 * Who else is here, on a phone.
 *
 * The player list only exists in the desktop rail, so on a phone the fact that
 * somebody else is building with you was invisible until they happened to
 * appear on screen. The dots use the same colour as each player's ring on the
 * mountain, so a name in the sheet and a marker on the slope connect.
 */
function MobilePresence() {
  const players = useGame((s) => s.players);
  const connected = useGame((s) => s.connected);
  const me = useGame((s) => s.playerId);
  const setSheet = useGame((s) => s.setSheet);
  const others = players.filter((p) => p.id !== me);
  if (!connected || others.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => setSheet("info")}
      className="flex min-h-7 shrink-0 items-center gap-1 rounded-full bg-panel/92 px-2 py-1 shadow-[var(--shadow-chip)]"
      aria-label={`${others.length} weitere online`}
    >
      {others.slice(0, 3).map((p) => (
        <span key={p.id} className="size-2.5 rounded-full" style={{ background: peerColor(p.id) }} />
      ))}
      <span className="value text-[10px] font-bold text-navy">
        {others.length > 3 ? `+${others.length - 3}` : others.length}
      </span>
    </button>
  );
}

/**
 * The one thing that is wrong, on a phone.
 *
 * The operational warnings live in a side panel that only desktop shows, so on
 * a phone the two facts that actually decide a resort — an installation
 * connected to nothing, and upkeep outrunning takings — were invisible. A
 * player could lose money for an hour with no hint. This surfaces the most
 * pressing one above the toolbar and opens the full panel when tapped.
 */
function MobileAlert() {
  const stats = useGame((s) => s.stats);
  const setSheet = useGame((s) => s.setSheet);
  const idle = stats.idleLifts + stats.idlePistes;
  const turnedAway = stats.queued;

  const alert =
    stats.incomePerHour < 0
      ? { tone: "bad" as const, text: "Unterhalt frisst mehr als die Einnahmen" }
      : idle > 0
        ? { tone: "bad" as const, text: `${idle} Anlage${idle > 1 ? "n" : ""} nicht angeschlossen` }
        : stats.closedPistes > 0
          ? { tone: "warn" as const, text: `${stats.closedPistes} Piste${stats.closedPistes > 1 ? "n" : ""} unter der Schneegrenze` }
          : turnedAway > 0
            ? {
                tone: "warn" as const,
                text: stats.bottleneckLabel
                  ? `Engpass: ${stats.bottleneckLabel}`
                  : `${fmtCompact(turnedAway)} Fahrten stehen an`,
              }
            : null;

  if (!alert) return null;
  return (
    <button
      type="button"
      onClick={() => setSheet("info")}
      className={`flex min-h-7 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-left text-[10px] font-semibold shadow-[var(--shadow-chip)] ${
        alert.tone === "bad" ? "bg-danger text-panel" : "bg-warn text-panel"
      }`}
    >
      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-panel/25 text-[10px] font-bold">
        !
      </span>
      <span className="min-w-0 flex-1 truncate">{alert.text}</span>
    </button>
  );
}

/** Difficulty colours, matching the run edges drawn on the mountain. */
function CenterTools() {
  const phase = useGame((s) => s.phase);
  const sheet = useGame((s) => s.sheet);
  const cancel = useGame((s) => s.cancelBuild);
  const building = phase !== "idle";
  if (sheet === "build") return null;
  // While building the editor card carries Bauen/Zurück/Abbrechen; the map
  // layers make room so the bar never runs over itself.
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 hidden max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1.5 lg:flex">
      {!building && <LayerTabs />}
      {building && phase !== "piste" && (
        <button
          type="button"
          onClick={cancel}
          aria-label="Bauen beenden"
          className="grid size-10 place-items-center rounded-full bg-panel text-danger shadow-[var(--shadow-chip)]"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

function toggleSheet(current: HudSheet, next: HudSheet) {
  useGame.getState().setSheet(current === next ? "none" : next);
}

function BuildReticle() {
  const phase = useGame((s) => s.phase);
  const stampMode = useGame((s) => s.stampMode);
  const hover = useGame((s) => s.hover);
  const buildItem = useGame((s) => s.buildItem);
  const lastStampAt = useGame((s) => s.lastStampAt);
  if (!stampMode || phase === "idle") return null;
  const ok = hover?.valid === true;
  const item = buildItem ? BY_ID[buildItem] : null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-[46%] z-20 hidden -translate-x-1/2 -translate-y-1/2 max-lg:block">
      <div key={lastStampAt} className="flex flex-col items-center">
        <svg viewBox="0 0 72 72" className="size-[4.5rem] drop-shadow-[0_2px_8px_rgba(11,31,58,0.28)]">
          <polygon
            points="36,6 64,21 64,51 36,66 8,51 8,21"
            fill={ok ? "rgba(52,168,83,0.2)" : "rgba(226,75,74,0.2)"}
            stroke={ok ? "#34A853" : "#E24B4A"}
            strokeWidth="3.2"
          />
          <polygon
            points="36,16 56,26 56,46 36,56 16,46 16,26"
            fill="none"
            stroke={ok ? "#ffffff" : "#ffd6d6"}
            strokeWidth="1.2"
            opacity="0.85"
          />
          <circle cx="36" cy="36" r="3.4" fill={ok ? "#34A853" : "#E24B4A"} />
        </svg>
        {item && (
          <div
            className={`mt-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold shadow-[var(--shadow-chip)] ${ok ? "bg-panel text-navy" : "bg-danger text-panel"}`}
          >
            {ok ? item.name : hover?.reason || "Nicht möglich"}
          </div>
        )}
      </div>
    </div>
  );
}

function MobileDock() {
  const terms = useBuildTerms();
  const sheet = useGame((s) => s.sheet);
  const phase = useGame((s) => s.phase);
  const finish = useGame((s) => s.finishPiste);
  const cancel = useGame((s) => s.cancelBuild);
  const confirm = useGame((s) => s.confirmHover);
  const buildItem = useGame((s) => s.buildItem);
  const hover = useGame((s) => s.hover);
  const item = buildItem ? BY_ID[buildItem] : null;
  const building = phase !== "idle";
  const ok = hover?.valid === true;
  const pisteMode = usePisteEditor((s) => s.mode);
  const draftLen = useGame((s) => s.pisteDraft.length);
  const routing = pisteMode === "route" && buildItem !== "road";
  const stampLabel =
    phase === "lift-a"
      ? "Talstation"
      : phase === "lift-b"
        ? "Bergstation"
        : phase === "piste"
          ? routing
            ? draftLen === 0
              ? "Start"
              : "Ziel"
            : "Feld"
          : "Setzen";

  if (sheet === "build" && !building) return null;
  return (
    <div
      className="pointer-events-auto px-3 pt-1 lg:hidden"
      style={{ paddingBottom: "max(0.45rem, env(safe-area-inset-bottom))" }}
    >
      {!building && <RoundBar mobile />}
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <MobileAlert />
          <MobilePresence />
        </div>
      </div>
      {building && (phase === "piste" ? <PisteEditor compact /> : <StampTray />)}
      {!building && <MobileCorners />}
      <div className={`flex items-center gap-1.5 rounded-[22px] bg-panel/95 p-1.5 shadow-[var(--shadow-panel)] backdrop-blur-md ${building ? "" : "hidden"}`}>
        {building ? (
          <>
            <div className="min-w-0 flex-1 px-2">
              <div className="truncate text-[11px] font-semibold text-navy">{item?.name ?? "Bauen"}</div>
              <div className="truncate text-[10px] text-muted">
                {ok ? "Raster zielen, dann stempeln" : hover?.reason || "Feld nicht bebaubar"}
              </div>
            </div>
            <button
              type="button"
              onClick={confirm}
              className={`flex h-11 min-w-[6.2rem] items-center justify-center gap-1 rounded-full px-3.5 text-[13px] font-semibold text-panel transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${ok ? "bg-success" : "bg-danger/80"}`}
            >
              {stampLabel}
              {item && phase === "place" ? (
                <span className="text-[10px] font-medium opacity-90">{fmtCompact(terms.cost(item.id))}</span>
              ) : null}
            </button>
            {phase === "piste" && (
              <button
                type="button"
                onClick={finish}
                disabled={draftLen < 2}
                className="flex h-11 items-center gap-1 rounded-full bg-accent px-3.5 text-[12px] font-semibold text-panel disabled:opacity-45"
              >
                <Check className="size-4" /> Bauen
              </button>
            )}
            <button
              type="button"
              onClick={cancel}
              aria-label="Abbrechen"
              className="grid size-11 place-items-center rounded-full bg-snow text-danger"
            >
              <X className="size-5" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Idle phone dock: menu and camera bottom left, the big Bauen bottom right. */
function MobileCorners() {
  const sheet = useGame((s) => s.sheet);
  return (
    <div className="flex items-end justify-between gap-2">
      <div className="flex items-end gap-2">
        <RoundButton label="Menü" onClick={() => toggleSheet(sheet, "menu")} active={sheet === "menu"}>
          <Settings className="size-5" />
        </RoundButton>
      </div>
      <BigBuildButton />
    </div>
  );
}

/**
 * A round HUD button with its label under it, as city builders have them:
 * the whole circle is the target, 56 px on a phone.
 */
function RoundButton({
  label,
  onClick,
  active = false,
  badge,
  children,
  size = "md",
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: ReactNode;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  const dim = size === "lg" ? "size-[4.5rem]" : "size-14";
  return (
    <button type="button" onClick={onClick} aria-label={label} className="pointer-events-auto flex flex-col items-center gap-0.5">
      <span
        className={`relative grid ${dim} place-items-center rounded-full shadow-[var(--shadow-panel)] ring-2 transition-transform duration-150 active:scale-95 ${active ? "bg-accent text-panel ring-panel" : "bg-panel/95 text-navy ring-panel/70 backdrop-blur-md"}`}
      >
        {children}
        {badge}
      </span>
      <span className="rounded-full bg-navy/70 px-2 py-0.5 text-[10px] font-bold leading-none text-panel">{label}</span>
    </button>
  );
}

/** The big Bauen button, bottom right, as in a city builder. */
function BigBuildButton() {
  const sheet = useGame((s) => s.sheet);
  const setSheet = useGame((s) => s.setSheet);
  return (
    <button
      type="button"
      onClick={() => setSheet(sheet === "build" ? "none" : "build")}
      aria-label="Bauen"
      className="pointer-events-auto flex flex-col items-center gap-0.5"
    >
      <span className="btn-3d grid size-[4.5rem] place-items-center rounded-full bg-accent text-panel shadow-[var(--shadow-panel)] ring-4 ring-panel" style={{ ["--lip" as string]: "var(--color-accent-dark)" }}>
        <Hammer className="size-8" />
      </span>
      <span className="rounded-full bg-navy/70 px-2.5 py-0.5 text-[11px] font-bold leading-none text-panel">Bauen</span>
    </button>
  );
}

/**
 * Betrieb, Ziele, Forschung, Team: round buttons down the right edge. Each
 * opens its panel — a sheet on a phone, a card beside the rail on a desktop.
 */
function ActionRail() {
  const sheet = useGame((s) => s.sheet);
  const phase = useGame((s) => s.phase);
  const unread = useUnreadChat();
  const researchReady = useResearchReady();
  if (phase !== "idle" || sheet === "build") return null;
  const open = (next: HudSheet) => toggleSheet(sheet, next);
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col gap-2.5 lg:top-1/2 lg:-translate-y-1/2">
      <RoundButton label="Betrieb" active={sheet === "info"} onClick={() => open("info")}>
        <BarChart3 className="size-6" />
      </RoundButton>
      <RoundButton label="Ziele" active={sheet === "quests"} onClick={() => open("quests")}>
        <ListChecks className="size-6" />
      </RoundButton>
      <RoundButton
        label="Forschung"
        active={sheet === "research"}
        onClick={() => open("research")}
        badge={researchReady && sheet !== "research" ? <span className="absolute right-0.5 top-0.5 size-3 rounded-full bg-success ring-2 ring-panel" aria-label="Forschung bereit" /> : null}
      >
        <FlaskConical className="size-6" />
      </RoundButton>
      <RoundButton label="Team" active={sheet === "chat"} onClick={() => open("chat")} badge={<UnreadBadge n={unread} />}>
        <MessageCircle className="size-6" />
      </RoundButton>
    </div>
  );
}

/** Desktop: menu bottom left, Bauen bottom right. */
function DesktopCorners() {
  const sheet = useGame((s) => s.sheet);
  const phase = useGame((s) => s.phase);
  if (phase !== "idle" || sheet === "build") return null;
  return (
    <>
      <div className="absolute bottom-4 left-4 z-20">
        <RoundButton label="Menü" active={sheet === "menu"} onClick={() => toggleSheet(sheet, "menu")}>
          <Settings className="size-6" />
        </RoundButton>
      </div>
      <div className="absolute bottom-4 right-4 z-20">
        <BigBuildButton />
      </div>
    </>
  );
}

/** Pings for the other player: tap one, then the spot on the map. */
function TeamMarks() {
  const setSheet = useGame((s) => s.setSheet);
  return (
    <div className="rounded-[16px] bg-ice/70 p-2.5">
      <div className="mb-1.5 text-[11px] font-semibold text-navy">Etwas auf der Karte zeigen</div>
      <div onClickCapture={() => setTimeout(() => setSheet("none"), 0)}>
        <MarkButtons />
      </div>
    </div>
  );
}

/**
 * Desktop: the panel the rail opens, as a card left of the rail. A selected
 * building, lift or run shows here too, with its details and upgrades.
 */
function DesktopPanel() {
  const sheet = useGame((s) => s.sheet);
  const selectedId = useGame((s) => s.selectedId);
  const phase = useGame((s) => s.phase);
  const setSheet = useGame((s) => s.setSheet);
  const selectEntity = useGame((s) => s.selectEntity);
  const showSelected = !!selectedId && phase === "idle" && (sheet === "none" || sheet === "info");
  if (!showSelected && (sheet === "none" || sheet === "build")) return null;
  const kind = showSelected ? "selected" : sheet;
  const title =
    kind === "selected"
      ? "Details"
      : kind === "info"
        ? "Betrieb"
        : kind === "quests"
          ? "Ziele & Partie"
          : kind === "research"
            ? "Forschung"
            : kind === "chat"
              ? "Team"
              : "Menü";
  const close = () => {
    if (kind === "selected") selectEntity(null);
    else setSheet("none");
  };
  const side = kind === "menu" ? "left-24" : "right-24";
  return (
    <div className={`pointer-events-auto absolute bottom-4 top-2 z-20 flex w-[340px] flex-col ${side}`}>
      <div className="flex max-h-full min-h-0 flex-col rounded-[24px] bg-panel/97 shadow-[var(--shadow-panel)] backdrop-blur-md">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <div className="text-[15px] font-semibold text-navy">{title}</div>
          <button type="button" aria-label="Schliessen" onClick={close} className="grid size-10 place-items-center rounded-full text-muted hover:bg-ice">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {kind === "selected" && <InfoPanel />}
          {kind === "info" && (
            <div className="flex flex-col gap-2">
              <OperationsPanel />
              <TicketPricePanel />
              <WalletPanel />
              <RenamePanel />
              <ActivityPanel />
            </div>
          )}
          {kind === "quests" && (
            <div className="flex flex-col gap-2">
              <MatchGoalsPanel />
              <VipCard />
              <SecretGoalCard />
              <DuelStandings />
              <MatchRulesPanel />
              <Quests />
            </div>
          )}
          {kind === "research" && <ResearchPanel />}
          {kind === "chat" && (
            <div className="flex flex-col gap-2">
              <PlayersLine />
              <TeamMarks />
              <ChatPanel />
            </div>
          )}
          {kind === "menu" && <MobileMenuBody />}
        </div>
      </div>
    </div>
  );
}

/**
 * The build menu of a city builder: round category buttons along the bottom,
 * and above them the items of that category as cards to swipe through. A tap
 * on a card picks it up; the drawer folds away and the map is free to build.
 */
function BuildDrawer() {
  const sheet = useGame((s) => s.sheet);
  const phase = useGame((s) => s.phase);
  const setSheet = useGame((s) => s.setSheet);
  const category = useGame((s) => s.category);
  const setCategory = useGame((s) => s.setCategory);
  const setBuildItem = useGame((s) => s.setBuildItem);
  const coins = useMyMoney().mine;
  const terms = useBuildTerms();
  if (sheet !== "build" || phase !== "idle") return null;
  const items = CATALOG.filter((i) => i.category === category);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
      <button type="button" aria-label="Schliessen" className="pointer-events-auto absolute inset-x-0 bottom-0 h-screen bg-navy/20" onClick={() => setSheet("none")} />
      <div className="relative mx-auto max-w-[1100px] px-2 lg:px-6" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <div className="pointer-events-auto -mx-2 flex snap-x gap-2 overflow-x-auto px-2 pb-2 pt-1 lg:mx-0 lg:px-0">
          {category === "pistes" && (
            <button
              type="button"
              onClick={() => openAutoPistes(null)}
              className="flex w-[7.5rem] shrink-0 snap-start flex-col overflow-hidden rounded-[18px] bg-accent text-left text-panel shadow-[var(--shadow-panel)] lg:w-[9rem]"
            >
              <span className="grid h-20 w-full place-items-center lg:h-24">
                <Sparkles className="size-9" />
              </span>
              <span className="px-2.5 pb-2.5 pt-1.5">
                <span className="block text-[13px] font-bold leading-tight">Pisten automatisch</span>
                <span className="mt-0.5 block text-[10px] leading-snug opacity-85">Plant, was sich lohnt</span>
              </span>
            </button>
          )}
          {items.map((it) => {
            const locked = terms.locked(it.id);
            const cost = terms.cost(it.id);
            const short = !locked && coins < cost;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => setBuildItem(it.id)}
                title={it.blurb}
                className="flex w-[7.5rem] shrink-0 snap-start flex-col overflow-hidden rounded-[18px] bg-panel text-left shadow-[var(--shadow-panel)] transition-transform active:scale-[0.97] lg:w-[9rem]"
              >
                <span className="relative block">
                  <ItemThumb id={it.id} className={`h-20 w-full lg:h-24 ${locked ? "grayscale" : ""}`} iconClass="size-8" />
                  {locked && (
                    <span className="absolute inset-0 grid place-items-center bg-snow/85 text-[11px] font-bold text-muted">
                      <span className="flex items-center gap-1">
                        <Lock className="size-4" /> Level {it.unlockLevel}
                      </span>
                    </span>
                  )}
                </span>
                <span className="flex flex-1 flex-col px-2.5 pb-2.5 pt-1.5">
                  <span className={`line-clamp-2 text-[12px] font-bold leading-tight ${locked ? "text-muted" : "text-navy"}`}>{it.name}</span>
                  <span
                    className={`mt-auto inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 pt-1 text-[11px] font-bold ${short ? "bg-warn/15 text-warn" : "bg-coin/15 text-navy"}`}
                  >
                    <Coin className="size-3.5" /> {priceLabel({ id: it.id, cost })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-[28px] bg-panel/97 p-1.5 shadow-[var(--shadow-panel)] backdrop-blur-md lg:gap-1 lg:p-2">
          {CATEGORIES.map((c) => {
            const Icon = CAT_ICON[c.id];
            const active = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[18px] py-1"
              >
                <span className={`grid size-11 place-items-center rounded-full transition-colors lg:size-12 ${active ? "bg-accent text-panel shadow-[var(--shadow-chip)]" : "bg-ice text-navy"}`}>
                  <Icon className="size-6" />
                </span>
                <span className={`max-w-full truncate text-[10px] font-bold ${active ? "text-accent" : "text-navy"}`}>{SHORT_CAT[c.id] ?? c.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSheet("none")}
            aria-label="Bauen schliessen"
            className="ml-1 grid size-11 shrink-0 place-items-center rounded-full bg-danger text-panel shadow-[var(--shadow-chip)] lg:size-12"
          >
            <X className="size-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StampTray() {
  const category = useGame((s) => s.category);
  const setCategory = useGame((s) => s.setCategory);
  const setBuildItem = useGame((s) => s.setBuildItem);
  const buildItem = useGame((s) => s.buildItem);
  const coins = useMyMoney().mine;
  const terms = useBuildTerms();
  const items = CATALOG.filter((i) => i.category === category);
  return (
    <div className="mb-1.5 rounded-[20px] bg-panel/95 p-1.5 shadow-[var(--shadow-panel)] backdrop-blur-md">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => {
          const Icon = CAT_ICON[c.id];
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`btn-3d ${active ? "" : "btn-3d-light"} flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold ${active ? "bg-accent text-panel" : "bg-ice text-navy"}`}
              style={active ? { ["--lip" as string]: "var(--color-accent-dark)" } : undefined}
            >
              <Icon className="size-3.5" />
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1 overflow-x-auto">
        {items.map((it) => {
          const locked = terms.locked(it.id);
          const tooExpensive = coins < terms.cost(it.id);
          const active = buildItem === it.id;
          const Icon = ITEM_ICON[it.id] ?? CAT_ICON[it.category];
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setBuildItem(it.id)}
              className={`btn-3d ${active ? "" : "btn-3d-light"} flex h-14 w-[4.6rem] shrink-0 flex-col items-center justify-center rounded-[14px] px-1 ${active ? "bg-accent text-panel" : locked ? "bg-snow text-subtle" : "bg-ice text-navy"}`}
              style={active ? { ["--lip" as string]: "var(--color-accent-dark)" } : undefined}
            >
              <Icon className="size-4" />
              <span className="mt-0.5 max-w-full truncate text-[9px] font-bold">{it.name.split(" ")[0]}</span>
              <span className={`value text-[9px] font-semibold ${active ? "text-panel/85" : tooExpensive ? "text-danger" : "text-muted"}`}>
                {locked ? `Lv ${it.unlockLevel}` : it.id === "piste" ? `ab ${fmtCompact(terms.cost(it.id))}` : fmtCompact(terms.cost(it.id))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MobileFloats() {
  const sheet = useGame((s) => s.sheet);
  const selectedId = useGame((s) => s.selectedId);
  const phase = useGame((s) => s.phase);
  const buildings = useGame((s) => s.buildings);
  const lifts = useGame((s) => s.lifts);
  const pistes = useGame((s) => s.pistes);
  const selectEntity = useGame((s) => s.selectEntity);
  const setSheet = useGame((s) => s.setSheet);
  const showSelected = !!selectedId && sheet === "none" && phase === "idle";
  const lift = lifts.find((l) => l.id === selectedId);
  const b = buildings.find((x) => x.id === selectedId);
  // A selected run gets the same chip, so it can be renamed and widened on a phone.
  const run = pistes.find((p) => p.id === selectedId);
  const selectedItem = lift ? BY_ID[lift.itemId] : b ? BY_ID[b.itemId] : run ? BY_ID[run.itemId] : null;
  const links = useResortLinks();
  const liftLink = lift ? (links.get(lift.id) as keyof typeof LIFT_LINK_TEXT | undefined) : undefined;

  if (sheet !== "none") return null;

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-2 z-20 hidden flex-col gap-2 max-lg:flex">
      {phase === "idle" && !selectedId && (
        <div className="flex justify-center">
          <RoleChooser />
          <EventCard />
        </div>
      )}
      {phase !== "piste" && (
        <div className="flex justify-center empty:hidden">
          <AutoPistesPanel />
        </div>
      )}
      <DescentOffer />
      <div className="flex justify-center empty:hidden">
        <NextStepChip />
      </div>
      {showSelected && selectedItem && (
        <button
          type="button"
          onClick={() => setSheet("info")}
          className="toast-in pointer-events-auto flex w-full items-center gap-3 rounded-[18px] bg-panel/95 p-3 text-left shadow-[var(--shadow-panel)]"
        >
          <ItemThumb id={selectedItem.id} className="size-11 shrink-0 rounded-[12px]" iconClass="size-5" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-navy">{run?.name || selectedItem.name}</span>
            <span className="block text-[11px] text-muted">
              {liftLink ? (
                <span className={liftLink === "ok" ? "font-semibold text-success" : "font-semibold text-warn"}>
                  {LIFT_LINK_TEXT[liftLink].chip}
                </span>
              ) : run ? (
                "Name, Breite und Details"
              ) : (
                "Details und Upgrades"
              )}
            </span>
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              selectEntity(null);
            }}
            className="grid size-11 place-items-center rounded-full text-muted"
          >
            <X className="size-4" />
          </span>
        </button>
      )}
      {showSelected && lift && liftLink === "no-descent" && (
        <div className="toast-in pointer-events-auto">
          <DescentButton liftId={lift.id} className="w-full shadow-[var(--shadow-panel)]" />
        </div>
      )}
    </div>
  );
}

function MobileSheets() {
  const sheet = useGame((s) => s.sheet);
  const selectedId = useGame((s) => s.selectedId);
  const setSheet = useGame((s) => s.setSheet);
  if (sheet === "none" || sheet === "build") return null;
  const title =
    sheet === "quests"
        ? "Ziele & Partie"
        : sheet === "info"
          ? "Betrieb"
          : sheet === "chat"
            ? "Team-Chat"
            : sheet === "research"
              ? "Forschung"
              : "Menü";
  return (
    <div className="pointer-events-none absolute inset-0 z-30 lg:hidden">
      <button
        type="button"
        aria-label="Schliessen"
        className="pointer-events-auto absolute inset-0 bg-navy/35"
        onClick={() => setSheet("none")}
      />
      <div
        className={`sheet-up pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-[28px] bg-panel shadow-[var(--shadow-panel)] ${sheet === "menu" ? "max-h-[88dvh]" : "max-h-[78dvh]"}`}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-2 px-4 pt-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-line" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2 pt-1">
          <div className="text-[15px] font-semibold text-navy">{title}</div>
          <button
            type="button"
            aria-label="Schliessen"
            onClick={() => setSheet("none")}
            className="grid size-11 place-items-center rounded-full text-muted"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {sheet === "quests" && (
            <div className="flex flex-col gap-3">
              <MatchGoalsPanel />
              <VipCard />
              <SecretGoalCard />
              <DuelStandings />
              <MatchRulesPanel />
              <Quests />
            </div>
          )}
          {sheet === "info" && (
            <div className="flex flex-col gap-2">
              {selectedId && <InfoPanel />}
              <OperationsPanel />
              <TicketPricePanel />
              <WalletPanel />
              <RenamePanel />
              <ActivityPanel />
            </div>
          )}
          {sheet === "menu" && <MobileMenuBody />}
          {sheet === "chat" && (
            <div className="flex flex-col gap-3">
              <TeamMarks />
              <ChatPanel compact />
            </div>
          )}
          {sheet === "research" && <ResearchPanel compact />}
        </div>
      </div>
    </div>
  );
}





/**
 * The phone menu: sections like a settings screen, one row per thing, every
 * row a full-width 48 px target. Saving sits on top, one tap; the list of
 * save points folds away until asked for.
 */
function MobileMenuBody() {
  const quality = useGame((s) => s.quality);
  const setQuality = (high: boolean) => useGame.setState({ quality: high ? "high" : "low" });
  const photo = useGame((s) => s.photoTextures);
  const setPhoto = useGame((s) => s.setPhotoTextures);
  const [sound, setSound] = useState(() => (typeof window === "undefined" ? true : soundEnabled()));
  return (
    <div className="flex flex-col gap-4 pb-2">
      <SavesPanel compact />
      <MenuSection title="Partie">
        <MobileMatchRows />
      </MenuSection>
      <MenuSection title="Karte">
        <div className="p-1.5">
          <LayerTabs />
        </div>
      </MenuSection>
      <MenuSection title="Einstellungen">
        <SwitchRow
          label="Ton"
          on={sound}
          onChange={(v) => {
            setSoundEnabled(v);
            setSound(v);
            if (v) play("click");
          }}
        />
        <SwitchRow label="Fotostrukturen" hint="Echte Felsen- und Schneetexturen" on={photo} onChange={setPhoto} />
        <SwitchRow label="Grafik hoch" hint="Aus spart Akku" on={quality === "high"} onChange={setQuality} />
      </MenuSection>
      <MenuSection title="Daten">
        <MenuRow label="Spielstand exportieren" hint="Als Datei auf dieses Gerät" onClick={() => exportSave(useGame.getState())} />
      </MenuSection>
      <p className="px-1 text-[10px] leading-snug text-subtle">{TERRAIN.attribution}</p>
    </div>
  );
}

/** A titled group of rows, like a settings screen. */
function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="divide-y divide-line overflow-hidden rounded-[18px] bg-snow ring-1 ring-line">{children}</div>
    </section>
  );
}

/** One tappable row: label, optional hint, chevron. */
function MenuRow({
  label,
  hint,
  onClick,
  tone = "plain",
  icon,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  tone?: "plain" | "accent" | "danger";
  icon?: ReactNode;
}) {
  const color = tone === "accent" ? "text-accent" : tone === "danger" ? "text-danger" : "text-navy";
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left active:bg-ice">
      {icon && <span className={`grid size-8 shrink-0 place-items-center rounded-full bg-ice ${color}`}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] font-semibold ${color}`}>{label}</span>
        {hint && <span className="block text-[11px] leading-snug text-muted">{hint}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-subtle" />
    </button>
  );
}

/** An on/off row with a real switch, the whole row tappable. */
function SwitchRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left active:bg-ice"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-navy">{label}</span>
        {hint && <span className="block text-[11px] leading-snug text-muted">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-panel shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

/** Start, leave or restart a match, as menu rows. */
function MobileMatchRows() {
  const mode = useGame((s) => s.match.mode);
  const openSetup = useGame((s) => s.setMatchSetupOpen);
  const start = useGame((s) => s.startMatch);
  const freePlay = useGame((s) => s.freePlay);
  const setSheet = useGame((s) => s.setSheet);
  const [armed, setArmed] = useState(false);
  return (
    <>
      <MenuRow
        icon={<Flag className="size-4" />}
        tone="accent"
        label={mode === "match" ? "Neue Partie" : "Partie starten"}
        hint="Runden mit Saisonzielen und Medaillen"
        onClick={() => {
          setSheet("none");
          openSetup(true);
        }}
      />
      {mode === "match" && (
        <MenuRow
          icon={<RotateCw className="size-4" />}
          label="Ohne Runden weiterspielen"
          hint="Dieses Tal bleibt, die Zeit läuft von selbst"
          onClick={() => {
            setSheet("none");
            freePlay();
          }}
        />
      )}
      {mode === "match" &&
        (armed ? (
          <div className="flex gap-1.5 p-2">
            <button type="button" onClick={() => setArmed(false)} className="h-11 flex-1 rounded-full bg-ice text-[12px] font-bold text-navy">
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => {
                setSheet("none");
                start("sandbox");
              }}
              className="h-11 flex-1 rounded-full bg-danger text-[12px] font-bold text-panel"
            >
              Alles abreissen
            </button>
          </div>
        ) : (
          <MenuRow
            icon={<Trash2 className="size-4" />}
            tone="danger"
            label="Freies Spiel in leerem Tal"
            hint="Reisst alles ab, vorher fragen wir nochmals"
            onClick={() => setArmed(true)}
          />
        ))}
    </>
  );
}


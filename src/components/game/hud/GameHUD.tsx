import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  BarChart3,
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
  Hand,
  Hotel,
  ListChecks,
  Menu,
  Mountain,
  MousePointer2,
  RotateCw,
  Snowflake,
  Star,
  Store,
  Trash2,
  Trees,
  Utensils,
  X,
} from "lucide-react";
import { peerColor } from "@/lib/game/players";
import { useIsDesktop } from "@/lib/game/use-breakpoint";
import { BY_ID, CATALOG, CATEGORIES, ECONOMY, FLOW, GRADE_LABEL, SEASON_LABEL, UPGRADES, getDem, gradeBand, isLift, levelFromXp, liftThroughput, seasonPhase, surveyPiste, xpForLevel } from "@/lib/game/catalog";
import type { CatalogItem } from "@/lib/game/catalog";
import { TERRAIN } from "@ski/config";
import { PENDING_READY } from "@ski/shared";
import { fmt, fmtCompact, fmtSigned } from "@/lib/game/format";
import { exportSave } from "@/lib/game/save";
import { useCardImages } from "@/lib/game/card-images";
import { play, setSoundEnabled, soundEnabled } from "@/lib/game/sound";
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
 * real number appears while drawing, in `PisteSurvey`.
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
          {desktop && <LeftColumn />}
          <div className="relative min-w-0 flex-1">
            {desktop && (
              <div className="absolute inset-x-0 top-2 z-10 flex flex-col items-center gap-2 px-3">
                <RoundBar />
                <EventCard />
                <BuildHint />
              </div>
            )}
            {!desktop && <BuildHint />}
            {desktop && <CenterTools />}
            {desktop && <Attribution />}
            {!desktop && <MobileFloats />}
          </div>
          {desktop && <RightColumn />}
        </div>
      </div>
      <BuildReticle />
      {!desktop && (
        <>
          <MobileDock />
          <MobileSheets />
        </>
      )}
      <div className="absolute left-1/2 top-[4.25rem] z-40 -translate-x-1/2 lg:bottom-16 lg:left-auto lg:right-[316px] lg:top-auto lg:translate-x-0">
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
  const coins = useGame((s) => s.coins);
  const gems = useGame((s) => s.gems);
  const stars = useGame((s) => s.stars);
  const season = useGame((s) => s.season);
  const day = useGame((s) => s.day);
  const weather = useGame((s) => s.weather);
  const resortName = useGame((s) => s.resortName);
  const setSheet = useGame((s) => s.setSheet);
  const sheet = useGame((s) => s.sheet);
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
        <Currency n={coins} icon={<Coin />} label="Kasse in CHF" />
        <Currency n={gems} icon={<Gem className="size-4 text-gem" />} label="Edelsteine" />
        <Currency n={stars} icon={<Star className="size-4 fill-star text-star" />} label="Prestige: jeder Stern +1 % Gäste" />
        <LevelChip />
        <div className="hidden items-center gap-2 rounded-full bg-panel/92 px-3 py-1.5 text-[11px] font-medium text-muted shadow-[var(--shadow-chip)] lg:flex">
          <WeatherIcon className="size-3.5 text-accent" />
          {weather.label} · {weather.tempC}°
          <span className="text-subtle">· S{season} T{day}</span>
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
        <Avatars />
        <IconBtn onClick={() => setSheet(sheet === "menu" ? "none" : "menu")} label="Menü">
          <Menu className="size-4" />
        </IconBtn>
      </div>
      <IconBtn
        className="size-11 shrink-0 lg:hidden"
        onClick={() => setSheet(sheet === "menu" ? "none" : "menu")}
        label="Menü"
      >
        <Menu className="size-5" />
      </IconBtn>
      {sheet === "menu" && (
        <div className="hidden lg:block">
          <MenuSheet />
        </div>
      )}
    </header>
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

function IconBtn({
  children,
  onClick,
  className = "",
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-full bg-panel/92 text-navy shadow-[var(--shadow-chip)] transition-transform duration-150 ease-[var(--ease-out)] hover:scale-[1.04] active:scale-[0.98] ${className}`}
    >
      {children}
    </button>
  );
}

function LeftColumn() {
  const category = useGame((s) => s.category);
  const setCategory = useGame((s) => s.setCategory);
  const setBuildItem = useGame((s) => s.setBuildItem);
  const cancel = useGame((s) => s.cancelBuild);
  const buildItem = useGame((s) => s.buildItem);
  const xp = useGame((s) => s.xp);
  const coins = useGame((s) => s.coins);
  const lvl = levelFromXp(xp);
  const items = CATEGORIES;
  return (
    <aside className="hidden w-[292px] shrink-0 flex-col gap-2 overflow-hidden p-3 pr-1 lg:flex">
      <Panel className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-navy">
            <Hammer className="size-4 text-accent" />
            Bauen
          </div>
          <button type="button" onClick={cancel} className="grid size-7 place-items-center rounded-full text-muted hover:bg-ice">
            <X className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {items.map((c) => {
            const Icon = CAT_ICON[c.id];
            const active = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                title={`${c.label} – ${c.hint}`}
                onClick={() => setCategory(c.id)}
                className={`flex flex-col items-center gap-1 rounded-[14px] px-1 py-2 text-[9px] font-semibold transition-colors duration-150 ${active ? "bg-accent text-panel" : "bg-snow text-navy hover:bg-ice"}`}
              >
                <Icon className="size-4" />
                <span className="max-w-full truncate">{c.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {CATEGORIES.find((c) => c.id === category)?.label}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
          {CATALOG.filter((i) => i.category === category).map((it) => {
            const locked = lvl < it.unlockLevel;
            const tooExpensive = coins < it.cost;
            const active = buildItem === it.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => setBuildItem(it.id)}
                title={it.blurb}
                className={`flex items-center gap-2.5 rounded-[14px] px-2 py-1.5 text-left transition-colors ${active ? "bg-accent text-panel" : locked ? "opacity-60 hover:bg-snow" : "hover:bg-snow"}`}
              >
                {locked ? (
                  <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-snow text-subtle">
                    <Lock className="size-4" />
                  </span>
                ) : (
                  <ItemThumb id={it.id} className={`size-9 shrink-0 rounded-[11px] ${active ? "ring-2 ring-panel/70" : ""}`} />
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[12px] font-semibold ${active ? "text-panel" : "text-navy"}`}>
                    {it.name}
                  </span>
                  <span className={`block truncate text-[10px] ${active ? "text-panel/80" : "text-muted"}`}>
                    {locked ? `Ab Level ${it.unlockLevel}` : it.blurb}
                  </span>
                </span>
                <span
                  className={`value ml-1 shrink-0 text-[11px] font-bold ${active ? "text-panel" : locked ? "text-subtle" : tooExpensive ? "text-warn" : "text-navy"}`}
                >
                  {priceLabel(it)}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>
      <TutorialCard />
    </aside>
  );
}

/**
 * The tutorial, collapsible.
 *
 * On a phone this card took some forty per cent of the height, over the map it
 * is telling you to build on — so it can be folded down to a single line and
 * reopened. Collapsing is not dismissing: the step is kept, so folding it away
 * to look at the mountain does not cost you the rest of the tutorial.
 */
function TutorialCard({ compact = false }: { compact?: boolean }) {
  const open = useGame((s) => s.tutorialOpen);
  const step = useGame((s) => s.tutorialStep);
  const next = useGame((s) => s.nextTutorial);
  const dismiss = useGame((s) => s.dismissTutorial);
  const [folded, setFolded] = useState(false);
  if (!open) return null;
  const copy = [
    { t: "Der erste Lift", b: "Wähle den Schlepplift, setz die Talstation beim Dorf und die Bergstation weiter oben am Hang." },
    { t: "Pisten zeichnen", b: "Wähle «Piste» und tippe von der Bergstation den Hang hinunter bis zurück ins Dorf. Das Gelände bestimmt Farbe und Preis." },
    { t: "Gäste kommen wegen der Pisten", b: "Mehr Kilometer und mehr Abwechslung (blau, rot, schwarz) bringen mehr Gäste. Parkhäuser und Hotels lassen sie ins Tal." },
    { t: "Zu zweit in Runden", b: "Startet eine Partie: Ihr baut gleichzeitig, dann drückt jede:r «Runde beenden» – das Spiel rechnet zehn Tage durch." },
  ];
  const c = copy[step] ?? copy[0]!;

  if (folded) {
    return (
      <Panel className="overflow-hidden">
        <button
          type="button"
          onClick={() => setFolded(false)}
          className="flex min-h-11 w-full items-center gap-2 px-3 text-left"
        >
          <span className="text-[10px] font-bold uppercase tracking-wide text-accent">Tutorial</span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-navy">{c.t}</span>
          <span className="value shrink-0 text-[10px] font-bold text-muted">{step + 1}/4</span>
          <ChevronRight className="size-4 shrink-0 -rotate-90 text-muted" />
        </button>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <div className={compact ? "p-2.5" : "p-3"}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-accent">
              Tutorial {step + 1}/4
            </div>
            <div className={`mt-0.5 font-semibold text-navy ${compact ? "text-[13px]" : "text-[14px]"}`}>{c.t}</div>
          </div>
          <button
            type="button"
            onClick={() => setFolded(true)}
            aria-label="Tutorial einklappen"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-ice text-muted"
          >
            <ChevronRight className="size-4 rotate-90" />
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted">{c.b}</p>
        <div className={`flex gap-1.5 ${compact ? "mt-2" : "mt-3"}`}>
          <button
            type="button"
            onClick={dismiss}
            className="btn-3d btn-3d-light h-10 shrink-0 rounded-full bg-ice px-4 text-[12px] font-bold text-navy"
          >
            Überspringen
          </button>
          <button
            type="button"
            onClick={step >= 3 ? dismiss : next}
            className="btn-3d flex h-10 flex-1 items-center justify-center gap-1 rounded-full bg-accent text-[13px] font-bold text-panel"
            style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
          >
            {step >= 3 ? "Loslegen" : "Weiter"} <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </Panel>
  );
}

function RightColumn() {
  const selectedId = useGame((s) => s.selectedId);
  const [tab, setTab] = useState<"ops" | "goals" | "team">("ops");
  const tabs = [
    { id: "ops" as const, label: "Betrieb" },
    { id: "goals" as const, label: "Ziele" },
    { id: "team" as const, label: "Team" },
  ];
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col gap-2 overflow-y-auto p-3 pl-1 lg:flex">
      {selectedId && <InfoPanel />}
      <Panel className="p-1">
        <div className="grid grid-cols-3 gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`h-9 rounded-full text-[12px] font-semibold transition-colors ${tab === t.id ? "bg-accent text-panel" : "text-navy hover:bg-snow"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Panel>
      {tab === "ops" && (
        <>
          <OperationsPanel />
          <TicketPricePanel />
        </>
      )}
      {tab === "goals" && (
        <>
          <Panel className="p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Partie</div>
            <MatchGoalsPanel />
          </Panel>
          <Quests />
        </>
      )}
      {tab === "team" && (
        <>
          <Panel className="p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Wer baut mit</div>
            <PlayersLine />
          </Panel>
          <RenamePanel />
          <ActivityPanel />
        </>
      )}
    </aside>
  );
}

/** Copernicus attribution, required wherever the terrain is shown. */
function Attribution() {
  return (
    <div className="pointer-events-auto absolute bottom-2 left-3 z-10 max-w-[18rem] text-[9px] leading-tight text-navy/60">
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
          className={`min-h-9 rounded-full px-2.5 text-[11px] font-semibold ${layer === t.id ? "bg-accent text-panel" : "text-navy hover:bg-snow"}`}
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
  const coins = useGame((s) => s.coins);
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
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <Stat label="Kapazität" value={cap ? `${fmt(cap)}/h` : "—"} />
        <Stat label="Ausgelastet" value={edge ? `${Math.round(load * 100)}%` : "—"} />
        <Stat label="Fahrten" value={edge ? `${fmt(Math.round(edge.flow))}/h` : "—"} />
      </div>
      {edge && edge.flow <= 0 && (
        <p className="mt-2 rounded-[12px] bg-danger/10 px-2 py-1.5 text-[11px] leading-snug text-danger">
          Diese Anlage befördert niemanden. Sie hängt an keiner Abfahrt, die zurück ins Dorf
          führt.
        </p>
      )}
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
      <DemolishButton id={entity.id} refund={refundFor(item.cost)} label={item.name} />
    </Panel>
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
  return (
    <Panel className="p-3">
      <div className="text-[13px] font-semibold uppercase tracking-wide text-navy">{item.name}</div>
      <div className="mt-0.5 text-[11px] text-muted">
        {segments} Segmente · {(segments * FLOW.kmPerSegment).toFixed(1)} km
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <Stat label="Kapazität" value={edge ? `${fmt(edge.capacity)}/h` : "—"} />
        <Stat label="Ausgelastet" value={edge ? `${Math.round(load * 100)}%` : "—"} />
        <Stat label="Fahrten" value={edge ? `${fmt(Math.round(edge.flow))}/h` : "—"} />
      </div>
      {closed && (
        <p className="mt-2 rounded-[12px] bg-danger/10 px-2 py-1.5 text-[11px] leading-snug text-danger">
          Zu: die Talseite dieser Abfahrt liegt unter der Schneegrenze von {fmt(stats.snowLineM)} m.
        </p>
      )}
      {!closed && edge && edge.flow <= 0 && (
        <p className="mt-2 rounded-[12px] bg-warn/12 px-2 py-1.5 text-[11px] leading-snug text-warn">
          Auf dieser Abfahrt fährt niemand. Sie muss oben an eine Bahn und unten ans Dorf oder an
          eine Talstation anschliessen.
        </p>
      )}
      <BuiltByLine builtBy={piste.builtBy} />
      <DemolishButton id={piste.id} refund={refundFor(item.cost * segments)} label={item.name} />
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
        <Stat label="Andrang" value={fmt(stats.marketPerHour)} />
        <Stat label="Fahrten/h" value={fmt(stats.peoplePerHour)} tone={stats.queued > 0 ? "warn" : "good"} />
        <Stat
          label="Warten"
          value={`${stats.waitMinutes}′`}
          tone={stats.waitMinutes > 12 ? "bad" : stats.waitMinutes > 6 ? "warn" : "neutral"}
        />
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center">
        <Stat label="Umsatz/T" value={fmt(stats.revenuePerHour)} />
        <Stat label="Unterhalt" value={`−${fmt(stats.upkeepPerHour)}`} tone="warn" />
        <Stat label="Netto/T" value={fmtSigned(stats.incomePerHour)} tone={stats.incomePerHour < 0 ? "bad" : "good"} />
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {stats.incomePerHour < 0 && (
          <Warning tone="bad">
            Der Unterhalt frisst mehr, als das Gebiet einnimmt. Schliess ungenutzte Anlagen ans Netz
            an oder mach den Berg attraktiver.
          </Warning>
        )}
        {idle > 0 && (
          <Warning tone="bad">
            {idle === 1 ? "Eine Anlage ist" : `${idle} Anlagen sind`} nicht angeschlossen und
            befördert niemanden. Eine Bahn braucht eine Abfahrt zurück ins Dorf.
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
        <span>Schneegrenze {fmt(stats.snowLineM)} m</span>
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
  if (!buildItem || phase === "idle") return null;
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
        : phase === "piste"
          ? stampMode
            ? "Piste feldweise setzen, dann Fertig"
            : "Hang talwärts tippen"
          : hover?.reason || (stampMode ? "Karte schieben, Raster zielen, Setzen" : "Feld tippen zum Bauen");
  return (
    <div className="pointer-events-none z-10 w-[min(92%,300px)] rounded-[16px] bg-panel/95 p-3 text-center shadow-[var(--shadow-panel)] max-lg:absolute max-lg:left-1/2 max-lg:top-2 max-lg:-translate-x-1/2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-navy">{item.name}</div>
      <div className="mt-1 text-[12px] text-muted">{msg}</div>
      {buildItem === "piste" ? (
        <PisteSurvey />
      ) : item.capacity ? (
        <div className="value mt-1 text-[13px] font-bold text-success">
          Kapazität {fmt(item.capacity)} Pers./h
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the line drawn so far would become.
 *
 * The grade is no longer a choice, so the player needs to see what the ground
 * is making of their line while they draw it — and what it will cost. This runs
 * the same `surveyPiste` the server prices with, so the number shown is the
 * number charged.
 */
function PisteSurvey() {
  const draft = useGame((s) => s.pisteDraft);
  const coins = useGame((s) => s.coins);
  if (draft.length < 2) {
    return (
      <div className="mt-1 text-[12px] text-muted">
        Schwierigkeit und Preis ergeben sich aus dem Hang.
      </div>
    );
  }
  const survey = surveyPiste(getDem(), "piste", draft);
  if (!survey) {
    return (
      <div className="mt-1 text-[12px] font-semibold text-danger">
        Zu steil für eine Piste.
      </div>
    );
  }
  const segments = draft.length - 1;
  const band = gradeBand(survey.grade);
  return (
    <div className="mt-1.5 flex items-center justify-center gap-2">
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold text-panel"
        style={{ background: PISTE_TINT[survey.grade] }}
      >
        {GRADE_LABEL[survey.grade]} Piste
      </span>
      <span className="value text-[13px] font-bold text-navy">
        {fmt(survey.cost)}
      </span>
      <span className="text-[11px] text-muted">
        {segments} Seg. · {fmt(band.capacity)}/h
      </span>
      {coins < survey.cost && <span className="text-[11px] font-bold text-danger">zu teuer</span>}
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
const PISTE_TINT: Record<string, string> = {
  blue: "#2b7de9",
  red: "#d64545",
  black: "#1c1c1c",
};

function CenterTools() {
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const phase = useGame((s) => s.phase);
  const finish = useGame((s) => s.finishPiste);
  const cancel = useGame((s) => s.cancelBuild);
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1.5 lg:flex">
      <LayerTabs />
      <span className="mx-1 h-6 w-px bg-navy/15" />
      <ToolBtn active={tool === "select"} onClick={() => setTool("select")} label="Auswahl">
        <MousePointer2 className="size-4" />
      </ToolBtn>
      <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} label="Verschieben">
        <Hand className="size-4" />
      </ToolBtn>
      <ToolBtn active={tool === "orbit"} onClick={() => setTool("orbit")} label="Drehen">
        <Mountain className="size-4" />
      </ToolBtn>
      {phase === "piste" && (
        <button
          type="button"
          onClick={finish}
          className="ml-1 flex h-10 items-center gap-1 rounded-full bg-success px-3 text-[12px] font-semibold text-panel"
        >
          <Check className="size-4" /> Fertig
        </button>
      )}
      {phase !== "idle" && (
        <button type="button" onClick={cancel} className="grid size-10 place-items-center rounded-full bg-panel text-danger shadow-[var(--shadow-chip)]">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

function ToolBtn({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`grid size-10 place-items-center rounded-[14px] shadow-[var(--shadow-chip)] ${active ? "bg-accent text-panel" : "bg-panel/92 text-navy"}`}
    >
      {children}
    </button>
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
  const sheet = useGame((s) => s.sheet);
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const phase = useGame((s) => s.phase);
  const finish = useGame((s) => s.finishPiste);
  const cancel = useGame((s) => s.cancelBuild);
  const confirm = useGame((s) => s.confirmHover);
  const buildItem = useGame((s) => s.buildItem);
  const hover = useGame((s) => s.hover);
  const weather = useGame((s) => s.weather);
  const stats = useGame((s) => s.stats);
  const item = buildItem ? BY_ID[buildItem] : null;
  const building = phase !== "idle";
  const ok = hover?.valid === true;
  const stampLabel =
    phase === "lift-a" ? "Talstation" : phase === "lift-b" ? "Bergstation" : phase === "piste" ? "Feld" : "Setzen";

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
        <div className="value shrink-0 rounded-full bg-panel/92 px-2.5 py-1 text-[11px] font-bold text-navy shadow-[var(--shadow-chip)]">
          {weather.tempC}° · {fmtCompact(stats.guestsPerHour)} Gäste · {stats.satisfaction}%
        </div>
      </div>
      {building && <StampTray />}
      <div className="flex items-center gap-1.5 rounded-[22px] bg-panel/95 p-1.5 shadow-[var(--shadow-panel)] backdrop-blur-md">
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
                <span className="text-[10px] font-medium opacity-90">{fmtCompact(item.cost)}</span>
              ) : null}
            </button>
            {phase === "piste" && (
              <button
                type="button"
                onClick={finish}
                className="flex h-11 items-center gap-1 rounded-full bg-accent px-3.5 text-[12px] font-semibold text-panel"
              >
                <Check className="size-4" /> Fertig
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
        ) : (
          <>
            <button
              type="button"
              aria-label={tool === "pan" ? "Drehen" : "Verschieben"}
              onClick={() => setTool(tool === "pan" ? "orbit" : "pan")}
              className={`grid size-11 shrink-0 place-items-center rounded-[14px] ${tool === "pan" ? "bg-accent text-panel" : "text-navy"}`}
            >
              {tool === "pan" ? <Hand className="size-5" /> : <RotateCw className="size-5" />}
            </button>
            <button
              type="button"
              onClick={() => toggleSheet(sheet, "build")}
              className={`flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full text-[13px] font-semibold ${sheet === "build" ? "bg-accent-dark text-panel" : "bg-accent text-panel"}`}
            >
              <Hammer className="size-4" /> Bauen
            </button>
            <button
              type="button"
              aria-label="Ziele"
              onClick={() => toggleSheet(sheet, "quests")}
              className={`grid size-11 shrink-0 place-items-center rounded-[14px] ${sheet === "quests" ? "bg-accent text-panel" : "text-navy"}`}
            >
              <ListChecks className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Info"
              onClick={() => toggleSheet(sheet, "info")}
              className={`grid size-11 shrink-0 place-items-center rounded-[14px] ${sheet === "info" ? "bg-accent text-panel" : "text-navy"}`}
            >
              <BarChart3 className="size-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StampTray() {
  const category = useGame((s) => s.category);
  const setCategory = useGame((s) => s.setCategory);
  const setBuildItem = useGame((s) => s.setBuildItem);
  const buildItem = useGame((s) => s.buildItem);
  const xp = useGame((s) => s.xp);
  const coins = useGame((s) => s.coins);
  const lvl = levelFromXp(xp);
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
          const locked = lvl < it.unlockLevel;
          const tooExpensive = coins < it.cost;
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
                {locked ? `Lv ${it.unlockLevel}` : it.id === "piste" ? `ab ${fmtCompact(it.cost)}` : fmtCompact(it.cost)}
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
  const tutorialOpen = useGame((s) => s.tutorialOpen);
  const phase = useGame((s) => s.phase);
  const buildings = useGame((s) => s.buildings);
  const lifts = useGame((s) => s.lifts);
  const selectEntity = useGame((s) => s.selectEntity);
  const setSheet = useGame((s) => s.setSheet);
  const showTutorial = tutorialOpen && sheet === "none" && phase === "idle" && !selectedId;
  const showSelected = !!selectedId && sheet === "none" && phase === "idle";
  const lift = lifts.find((l) => l.id === selectedId);
  const b = buildings.find((x) => x.id === selectedId);
  const selectedItem = lift ? BY_ID[lift.itemId] : b ? BY_ID[b.itemId] : null;

  if (sheet !== "none") return null;

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-2 z-20 hidden flex-col gap-2 max-lg:flex">
      {phase === "idle" && !selectedId && (
        <div className="flex justify-center">
          <EventCard />
        </div>
      )}
      {showTutorial && (
        <div className="toast-in pointer-events-auto">
          <TutorialCard compact />
        </div>
      )}
      {showSelected && selectedItem && (
        <button
          type="button"
          onClick={() => setSheet("info")}
          className="toast-in pointer-events-auto flex w-full items-center gap-3 rounded-[18px] bg-panel/95 p-3 text-left shadow-[var(--shadow-panel)]"
        >
          <ItemThumb id={selectedItem.id} className="size-11 shrink-0 rounded-[12px]" iconClass="size-5" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-navy">{selectedItem.name}</span>
            <span className="block text-[11px] text-muted">Details und Upgrades</span>
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
    </div>
  );
}

function MobileSheets() {
  const sheet = useGame((s) => s.sheet);
  const setSheet = useGame((s) => s.setSheet);
  if (sheet === "none") return null;
  const title = sheet === "build" ? "Bauen" : sheet === "quests" ? "Ziele & Partie" : sheet === "info" ? "Gebiet" : "Menü";
  return (
    <div className="pointer-events-none absolute inset-0 z-30 lg:hidden">
      <button
        type="button"
        aria-label="Schliessen"
        className="pointer-events-auto absolute inset-0 bg-navy/35"
        onClick={() => setSheet("none")}
      />
      <div
        className="sheet-up pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[78dvh] flex-col rounded-t-[28px] bg-panel shadow-[var(--shadow-panel)]"
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
          {sheet === "build" && <MobileBuildGrid />}
          {sheet === "quests" && (
            <div className="flex flex-col gap-3">
              <MatchGoalsPanel />
              <Quests />
            </div>
          )}
          {sheet === "info" && (
            <div className="flex flex-col gap-2">
              <InfoPanel />
              <OperationsPanel />
              <TicketPricePanel />
              <RenamePanel />
              <ActivityPanel />
            </div>
          )}
          {sheet === "menu" && <MobileMenuBody />}
        </div>
      </div>
    </div>
  );
}

function MobileBuildGrid() {
  const setBuildItem = useGame((s) => s.setBuildItem);
  const category = useGame((s) => s.category);
  const setCategory = useGame((s) => s.setCategory);
  const xp = useGame((s) => s.xp);
  const lvl = levelFromXp(xp);
  const items = CATALOG.filter((i) => i.category === category);
  return (
    <div>
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-3">
        {CATEGORIES.map((c) => {
          const Icon = CAT_ICON[c.id];
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold ${active ? "bg-accent text-panel" : "bg-ice text-navy"}`}
            >
              <Icon className="size-4" />
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => {
          const locked = lvl < it.unlockLevel;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setBuildItem(it.id)}
              className={`min-h-[5.5rem] overflow-hidden rounded-[16px] bg-snow text-left ${locked ? "opacity-55" : ""}`}
            >
              <div className="relative">
                <ItemThumb id={it.id} className="h-20 w-full" iconClass="size-7" />
                {locked && (
                  <span className="absolute inset-0 grid place-items-center bg-snow/70 text-[11px] font-semibold text-subtle">
                    <span className="flex items-center gap-1">
                      <Lock className="size-4" /> Ab Level {it.unlockLevel}
                    </span>
                  </span>
                )}
              </div>
              <div className="p-3 pt-2">
              <div className="text-[13px] font-semibold text-navy">{it.name}</div>
              <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted">{it.blurb}</div>
              <div className="mt-2 flex items-center gap-1 text-[12px] font-semibold text-coin">
                <Coin className="size-3.5" /> {fmt(it.cost)}
              </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MatchMenuButtons() {
  const mode = useGame((s) => s.match.mode);
  const openSetup = useGame((s) => s.setMatchSetupOpen);
  const start = useGame((s) => s.startMatch);
  const setSheet = useGame((s) => s.setSheet);
  const [armed, setArmed] = useState(false);
  return (
    <>
      <button
        type="button"
        className="flex min-h-12 w-full items-center gap-2 rounded-[16px] bg-accent px-4 text-left text-[13px] font-bold text-panel"
        onClick={() => {
          setSheet("none");
          openSetup(true);
        }}
      >
        <Flag className="size-4" /> {mode === "match" ? "Neue Partie" : "Partie starten"}
      </button>
      {mode === "match" &&
        (armed ? (
          <button
            type="button"
            className="flex min-h-12 w-full items-center rounded-[16px] bg-danger/10 px-4 text-left text-[13px] font-semibold text-danger"
            onClick={() => {
              setSheet("none");
              start("sandbox");
            }}
          >
            Partie abbrechen und Tal leeren?
          </button>
        ) : (
          <button
            type="button"
            className="flex min-h-12 w-full items-center rounded-[16px] bg-ice px-4 text-left text-[13px] font-medium text-navy"
            onClick={() => setArmed(true)}
          >
            Zum freien Spiel wechseln
          </button>
        ))}
    </>
  );
}

function SoundToggle({ className }: { className: string }) {
  const [on, setOn] = useState(() => (typeof window === "undefined" ? true : soundEnabled()));
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        setSoundEnabled(!on);
        setOn(!on);
        if (!on) play("click");
      }}
    >
      Ton: {on ? "An" : "Aus"}
    </button>
  );
}

function PhotoTextureToggle({ className }: { className: string }) {
  const on = useGame((s) => s.photoTextures);
  const set = useGame((s) => s.setPhotoTextures);
  return (
    <button type="button" className={className} onClick={() => set(!on)}>
      Fotostrukturen: {on ? "An" : "Aus"}
    </button>
  );
}

function MobileMenuBody() {
  const quality = useGame((s) => s.quality);
  return (
    <div className="flex flex-col gap-3 pb-2">
      <MatchMenuButtons />
      <PhotoTextureToggle className="flex min-h-12 w-full items-center rounded-[16px] bg-ice px-4 text-left text-[13px] font-medium text-navy" />
      <SoundToggle className="flex min-h-12 w-full items-center rounded-[16px] bg-ice px-4 text-left text-[13px] font-medium text-navy" />
      <LayerTabs />
      <button
        type="button"
        className="flex min-h-12 w-full items-center rounded-[16px] bg-ice px-4 text-left text-[13px] font-medium text-navy"
        onClick={() => useGame.setState({ quality: quality === "high" ? "low" : "high" })}
      >
        Grafik: {quality === "high" ? "Hoch" : "Sparsam"}
      </button>
      <button
        type="button"
        className="flex min-h-12 w-full items-center rounded-[16px] bg-ice px-4 text-left text-[13px] font-medium text-navy"
        onClick={() => exportSave(useGame.getState())}
      >
        Spielstand exportieren
      </button>
      <p className="text-[10px] leading-snug text-subtle">{TERRAIN.attribution}</p>
    </div>
  );
}

function MenuSheet() {
  const quality = useGame((s) => s.quality);
  return (
    <div className="absolute right-3 top-14 z-30 flex w-72 flex-col gap-1.5 rounded-[20px] bg-panel p-3 shadow-[var(--shadow-panel)]">
      <MatchMenuButtons />
      <SoundToggle className="w-full rounded-[12px] bg-ice px-3 py-2.5 text-left text-[12px] font-medium text-navy" />
      <PhotoTextureToggle className="w-full rounded-[12px] bg-ice px-3 py-2.5 text-left text-[12px] font-medium text-navy" />
      <button
        type="button"
        className="w-full rounded-[12px] bg-ice px-3 py-2.5 text-left text-[12px] font-medium text-navy"
        onClick={() => useGame.setState({ quality: quality === "high" ? "low" : "high" })}
      >
        Grafik: {quality === "high" ? "Hoch" : "Sparsam"}
      </button>
      <button
        type="button"
        className="w-full rounded-[12px] bg-ice px-3 py-2.5 text-left text-[12px] font-medium text-navy"
        onClick={() => exportSave(useGame.getState())}
      >
        Spielstand exportieren
      </button>
    </div>
  );
}

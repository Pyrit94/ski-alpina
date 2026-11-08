import type { ReactNode } from "react";
import { Cloud, CloudFog, CloudLightning, Sun, Check, Gem, Snowflake, Star, X, Settings, Smile, Users, LayoutGrid } from "lucide-react";
import { peerColor } from "@/lib/game/players";
import { useIsDesktop } from "@/lib/game/use-breakpoint";
import { BY_ID, levelFromXp, xpForLevel } from "@/lib/game/catalog";
import { TERRAIN } from "@ski/config";
import { usePisteEditor } from "@/lib/game/piste-editor";
import { fmt, fmtCompact } from "@/lib/game/format";
import { ChatPanel, MarkHint } from "./TeamHUD";
import { ResearchPanel } from "./ResearchHUD";
import { DuelStandings, MatchRulesPanel, MyPurseChip, RoleChooser, SecretGoalCard, VipCard, WalletPanel } from "./RulesHUD";
import { DescentButton, DescentOffer } from "./LinkStatus";
import { AutoPistesPanel } from "./AutoPistes";
import { NextStepChip } from "./NextStepChip";
import { LIFT_LINK_TEXT, useResortLinks } from "@/lib/game/links";
import { PisteEditor } from "./PisteEditor";
import { useBuildTerms } from "@/lib/game/research";
import { Celebration, EventCard, FinalScreen, MatchGoalsPanel, MatchSetupModal, RoundBar, RoundReportModal, Toasts } from "./MatchHUD";
import { useGame } from "@/lib/game/store";
import { toggleSheet } from "./hud-shared";
import { Coin, ItemThumb, LayerTabs, RoundButton } from "./HudBits";
import { ActivityPanel, InfoPanel, OperationsPanel, TicketPricePanel, RenamePanel, Quests } from "./InfoPanels";
import { MobileMenuBody } from "./MenuBody";
import { BuildDrawer, BigBuildButton } from "./BuildDrawer";
import { ActionRail, DesktopCorners, TeamMarks, DesktopPanel } from "./Rail";

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
        ? "Raster auf die Talstation"
        : "Talstation tippen"
      : phase === "lift-b"
        ? stampMode
          ? "Raster auf die Bergstation"
          : "Bergstation tippen"
        : hover?.reason || (stampMode ? "Raster zielen, dann Setzen" : "Feld tippen");
  return (
    <div className="pointer-events-none z-10 flex max-w-[min(92%,360px)] items-center gap-2 rounded-full bg-panel/95 px-3.5 py-2 text-[12px] shadow-[var(--shadow-panel)] max-lg:absolute max-lg:left-1/2 max-lg:top-2 max-lg:-translate-x-1/2">
      <span className="shrink-0 font-bold text-navy">{item.name}</span>
      <span className="min-w-0 truncate text-muted">{msg}</span>
      {item.capacity ? <span className="value shrink-0 font-bold text-success">{fmtCompact(item.capacity)}/h</span> : null}
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
      {building && phase === "piste" && <PisteEditor compact />}
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
            {phase !== "piste" && (
              <button
                type="button"
                onClick={() => {
                  // Back to the build menu, on the same category.
                  cancel();
                  useGame.getState().setSheet("build");
                }}
                aria-label="Anderes Objekt"
                className="grid size-11 place-items-center rounded-full bg-ice text-navy"
              >
                <LayoutGrid className="size-5" />
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

import type { ReactNode } from "react";
import { useState } from "react";
import {
  BarChart3,
  Bus,
  Cable,
  Check,
  ChevronRight,
  Compass,
  Crosshair,
  Gem,
  Hammer,
  Hand,
  HelpCircle,
  Hotel,
  Layers,
  ListChecks,
  Map as MapIcon,
  Menu,
  Mountain,
  MousePointer2,
  RotateCw,
  Shield,
  Snowflake,
  Star,
  Store,
  Trees,
  Utensils,
  Volume2,
  X,
  ZoomIn,
} from "lucide-react";
import { BY_ID, CATALOG, CATEGORIES, QUICK, UPGRADES, isLift, levelFromXp, liftThroughput, xpForLevel } from "@/lib/game/catalog";
import { fmt, fmtCompact } from "@/lib/game/format";
import { exportSave } from "@/lib/game/save";
import { useGame } from "@/lib/game/store";
import type { Category, HudSheet, ItemId, MapLayer } from "@/lib/game/types";

function PlayersLine() {
  const players = useGame((s) => s.players);
  const connected = useGame((s) => s.connected);
  return (
    <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
      <span className={`size-2 rounded-full ${connected ? "bg-success" : "bg-warn"}`} />
      {connected ? `${Math.max(1, players.length)} online` : "Verbinde…"}
      <span className="truncate">{players.map((p) => p.name).join(", ")}</span>
    </div>
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
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col text-ink">
      <TopBar />
      <div className="relative min-h-0 flex-1">
        <div className="flex h-full">
          <LeftColumn />
          <div className="relative min-w-0 flex-1">
            <BuildHint />
            <CenterTools />
            <Minimap />
            <MobileFloats />
          </div>
          <RightColumn />
        </div>
      </div>
      <BottomBar />
      <MobileDock />
      <MobileSheets />
    </div>
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
  const setSheet = useGame((s) => s.setSheet);
  const sheet = useGame((s) => s.sheet);
  return (
    <header
      className="pointer-events-auto flex items-center gap-2 px-3 lg:px-4"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div className="flex shrink-0 items-center gap-2 rounded-full bg-panel/92 py-1 pl-1 pr-2.5 shadow-[var(--shadow-chip)] lg:pr-3">
        <LogoMark />
        <div className="hidden leading-tight sm:block">
          <div className="text-[13px] font-bold tracking-wide text-navy lg:text-[15px]">SKI BUILDER</div>
          <div className="hidden text-[9px] font-medium uppercase tracking-[0.14em] text-muted lg:block">
            Baue dein Traum-Skigebiet
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-x-auto lg:justify-center lg:gap-2">
        <Currency n={coins} icon={<Coin />} onAdd />
        <Currency n={gems} icon={<Gem className="size-4 text-gem" />} onAdd />
        <Currency n={stars} icon={<Star className="size-4 fill-star text-star" />} onAdd />
        <div className="hidden items-center gap-2 rounded-full bg-panel/92 px-3 py-1.5 text-[11px] font-medium text-muted shadow-[var(--shadow-chip)] lg:flex">
          Saison {season} · Tag {day}
          <span className="inline-flex items-center gap-1 text-accent">
            <Snowflake className="size-3.5" />
            {weather.tempC}°
          </span>
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
        <IconBtn onClick={() => useGame.setState({ layer: "heat" })}>
          <BarChart3 className="size-4" />
        </IconBtn>
        <IconBtn>
          <Shield className="size-4" />
        </IconBtn>
        <IconBtn onClick={() => useGame.setState({ layer: "3d" })}>
          <MapIcon className="size-4" />
        </IconBtn>
        <IconBtn onClick={() => setSheet(sheet === "menu" ? "none" : "menu")}>
          <Layers className="size-4" />
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

function Currency({ n, icon, onAdd }: { n: number; icon: ReactNode; onAdd?: boolean }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-panel/92 py-1 pl-2 pr-2 shadow-[var(--shadow-chip)] lg:pr-1">
      {icon}
      <span className="min-w-[1.6rem] text-right text-[12px] font-semibold tabular-nums text-navy lg:min-w-[2.4rem] lg:text-[13px]">
        {fmtCompact(n)}
      </span>
      {onAdd && (
        <span className="hidden size-5 place-items-center rounded-full bg-accent text-[11px] font-bold text-panel lg:grid">
          +
        </span>
      )}
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
    <aside className="hidden w-[292px] shrink-0 flex-col gap-2 overflow-y-auto p-3 pr-1 lg:flex">
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
        <div className="flex flex-col gap-1">
          {items.map((c) => {
            const Icon = CAT_ICON[c.id];
            const active = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`flex items-center gap-3 rounded-[14px] px-2.5 py-2 text-left transition-colors duration-150 ${active ? "bg-accent-soft" : "hover:bg-snow"}`}
              >
                <span className={`grid size-9 place-items-center rounded-[10px] ${active ? "bg-accent text-panel" : "bg-ice text-navy"}`}>
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block text-[12px] font-semibold uppercase tracking-wide text-navy">{c.label}</span>
                  <span className="block text-[10px] text-muted">{c.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel className="p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {CATEGORIES.find((c) => c.id === category)?.label}
        </div>
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
          {CATALOG.filter((i) => i.category === category).map((it) => {
            const locked = lvl < it.unlockLevel;
            const tooExpensive = coins < it.cost;
            const active = buildItem === it.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => setBuildItem(it.id)}
                className={`flex items-center justify-between rounded-[12px] px-2 py-1.5 text-left ${active ? "bg-accent text-panel" : "hover:bg-snow"}`}
              >
                <span className="min-w-0">
                  <span className={`block truncate text-[12px] font-semibold ${active ? "text-panel" : "text-navy"}`}>
                    {it.name}
                  </span>
                  <span className={`block truncate text-[10px] ${active ? "text-panel/80" : "text-muted"}`}>
                    {locked ? `Level ${it.unlockLevel}` : it.blurb}
                  </span>
                </span>
                <span
                  className={`ml-2 shrink-0 text-[11px] font-semibold tabular-nums ${tooExpensive && !active ? "text-danger" : active ? "text-panel" : "text-navy"}`}
                >
                  {fmt(it.cost)}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel className="p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Schnellauswahl</div>
        <div className="grid grid-cols-3 gap-1.5">
          {QUICK.map((id) => {
            const it = BY_ID[id];
            const Icon = ITEM_ICON[id] ?? Cable;
            const locked = lvl < it.unlockLevel;
            const active = buildItem === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setBuildItem(id)}
                className={`flex flex-col items-center gap-1 rounded-[14px] px-1 py-2 text-[10px] font-medium ${active ? "bg-accent text-panel" : locked ? "bg-snow text-subtle" : "bg-ice text-navy hover:bg-accent-soft"}`}
              >
                <Icon className="size-4" />
                {it.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </Panel>
      <TutorialCard />
    </aside>
  );
}

function TutorialCard({ compact = false }: { compact?: boolean }) {
  const open = useGame((s) => s.tutorialOpen);
  const step = useGame((s) => s.tutorialStep);
  const next = useGame((s) => s.nextTutorial);
  const dismiss = useGame((s) => s.dismissTutorial);
  if (!open) return null;
  const copy = [
    { t: "Dein Skigebiet wartet!", b: "Verbinde die ersten Hütten mit einer Gondelbahn und starte in die Saison." },
    { t: "Pisten zeichnen", b: "Wähle eine blaue Piste und tippe den Hang hinunter – immer talwärts." },
    { t: "Einkehrschwung", b: "Ein Restaurant an der Strecke bringt Einnahmen und zufriedene Gäste." },
    { t: "Wachsen", b: "Erfülle Aufgaben, upgrade Bahnen und öffne höhere Lagen." },
  ];
  const c = copy[step] ?? copy[0]!;
  return (
    <Panel className="overflow-hidden">
      {!compact && <img src="/textures/station.jpg" alt="" className="h-20 w-full object-cover" />}
      <div className="p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-accent">Tutorial</div>
        <div className="mt-1 text-[14px] font-semibold text-navy">{c.t}</div>
        <p className="mt-1 text-[11px] leading-snug text-muted">{c.b}</p>
        <button
          type="button"
          onClick={step >= 3 ? dismiss : next}
          className="mt-3 flex h-11 w-full items-center justify-center gap-1 rounded-full bg-accent text-[12px] font-semibold text-panel"
        >
          {step >= 3 ? "Loslegen" : "Starten"} <ChevronRight className="size-4" />
        </button>
      </div>
    </Panel>
  );
}

function RightColumn() {
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col gap-2 overflow-y-auto p-3 pl-1 lg:flex">
      <LayerTabs />
      <InfoPanel />
      <Notifications />
      <Quests />
    </aside>
  );
}

function LayerTabs() {
  const layer = useGame((s) => s.layer);
  const setLayer = useGame((s) => s.setLayer);
  const tabs: { id: MapLayer; label: string }[] = [
    { id: "3d", label: "3D Karte" },
    { id: "height", label: "Höhenkarte" },
    { id: "pistes", label: "Pistennetz" },
    { id: "heat", label: "Wärmekarte" },
  ];
  return (
    <Panel className="p-2">
      <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Karten-Ebene</div>
      <div className="grid grid-cols-2 gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setLayer(t.id)}
            className={`min-h-10 rounded-full px-2 py-1.5 text-[10px] font-semibold ${layer === t.id ? "bg-accent text-panel" : "bg-ice text-navy"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </Panel>
  );
}

function InfoPanel() {
  const selectedId = useGame((s) => s.selectedId);
  const buildings = useGame((s) => s.buildings);
  const lifts = useGame((s) => s.lifts);
  const stats = useGame((s) => s.stats);
  const upgrade = useGame((s) => s.upgrade);
  const coins = useGame((s) => s.coins);
  const lift = lifts.find((l) => l.id === selectedId);
  const b = buildings.find((x) => x.id === selectedId);
  const item = lift ? BY_ID[lift.itemId] : b ? BY_ID[b.itemId] : null;
  const entity = lift ?? b;
  if (!item || !entity) {
    return (
      <Panel className="p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Info</div>
        <p className="mt-2 text-[12px] text-muted">Tippe ein Gebaeude oder eine Bahn, um Details zu sehen.</p>
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <Stat label="Personen" value={`${fmt(stats.peoplePerHour)}/h`} />
          <Stat label="Zufrieden" value={`${stats.satisfaction}%`} />
          <Stat label="Einnahmen" value={`+${fmt(stats.incomePerHour)}/h`} />
        </div>
        <PlayersLine />
        <p className="mt-3 text-[10px] leading-snug text-subtle">
          Enthaelt modifizierte Copernicus-Daten (DEM GLO-30), © European Union / ESA
        </p>
      </Panel>
    );
  }
  const cap = isLift(item.id) ? liftThroughput(item, entity.upgrades) : item.capacity;
  const constructing = entity.readyAt > Date.now();
  return (
    <Panel className="p-3">
      <div className="flex items-start gap-2">
        <img src="/textures/station.jpg" alt="" className="size-12 rounded-[12px] object-cover" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-navy">{item.name}</div>
          <div className="mt-0.5 inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
            Level {entity.level}
          </div>
        </div>
      </div>
      {constructing && <div className="mt-2 text-[11px] text-warn">Im Bau…</div>}
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <Stat label="Personen" value={cap ? `${fmt(cap)}/h` : "—"} />
        <Stat label="Zufriedenheit" value={`${stats.satisfaction}%`} />
        <Stat label="Einnahmen" value={`+${fmt(Math.round(stats.incomePerHour / Math.max(1, lifts.length)))}/h`} />
      </div>
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
          <button
            type="button"
            className="mt-2 flex h-11 w-full items-center justify-center gap-1 rounded-full bg-accent text-[12px] font-semibold text-panel"
            onClick={() => upgrade(entity.id, "capacity")}
          >
            Upgrade <Coin className="size-3.5" /> {fmt(UPGRADES[2]!.cost[entity.upgrades.capacity] ?? 0)}
          </button>
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-snow px-1 py-2">
      <div className="text-[9px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="text-[12px] font-semibold tabular-nums text-navy">{value}</div>
    </div>
  );
}

function Notifications() {
  const notes = useGame((s) => s.notifications);
  const n = notes[0];
  if (!n) return null;
  return (
    <Panel className="p-3">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Benachrichtigungen</div>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-5 place-items-center rounded-full bg-success text-panel">
          <Check className="size-3" />
        </span>
        <div>
          <div className="text-[12px] font-semibold text-navy">{n.title}</div>
          <div className="text-[11px] text-muted">{n.body}</div>
        </div>
      </div>
    </Panel>
  );
}

function Quests() {
  const quests = useGame((s) => s.quests);
  const claim = useGame((s) => s.claimQuest);
  const stats = useGame((s) => s.stats);
  const active = quests.filter((q) => !q.claimed).slice(0, 3);
  return (
    <Panel className="p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Fortschritt & Ziele</div>
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
      <div className="mt-3 text-[10px] text-muted">
        Pisten {stats.pisteKm} km · Betten {stats.beds} · Kapazität {fmt(stats.liftCapacity)}/h
      </div>
    </Panel>
  );
}

function BuildHint() {
  const buildItem = useGame((s) => s.buildItem);
  const phase = useGame((s) => s.phase);
  const hover = useGame((s) => s.hover);
  if (!buildItem || phase === "idle") return null;
  const item = BY_ID[buildItem];
  const msg =
    phase === "lift-a"
      ? "Erste Station wählen"
      : phase === "lift-b"
        ? "Gegenstation wählen"
        : phase === "piste"
          ? "Piste talwärts zeichnen, dann Fertig"
          : hover?.reason || item.blurb;
  return (
    <div className="pointer-events-none absolute left-1/2 top-2 z-10 w-[min(92%,280px)] -translate-x-1/2 rounded-[16px] bg-panel/95 p-3 text-center shadow-[var(--shadow-panel)] lg:top-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-navy">{item.name}</div>
      <div className="mt-1 text-[12px] text-muted">{msg}</div>
      {item.capacity ? (
        <div className="mt-1 text-[12px] font-semibold text-success">Kapazität {fmt(item.capacity)} Pers./h</div>
      ) : null}
    </div>
  );
}

function CenterTools() {
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const phase = useGame((s) => s.phase);
  const finish = useGame((s) => s.finishPiste);
  const cancel = useGame((s) => s.cancelBuild);
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1.5 lg:flex">
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

function Minimap() {
  const season = useGame((s) => s.season);
  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 hidden overflow-hidden rounded-[18px] shadow-[var(--shadow-panel)] lg:block">
      <div className="relative h-28 w-36">
        <img src="/textures/hero.jpg" alt="Minikarte" className="h-full w-full object-cover" />
        <div className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-panel/90 text-navy">
          <Compass className="size-3.5" />
        </div>
        <div className="absolute bottom-1 left-1 rounded-full bg-navy/70 px-1.5 py-0.5 text-[9px] text-snow">
          S{season}
        </div>
      </div>
    </div>
  );
}

function BottomBar() {
  const phase = useGame((s) => s.phase);
  const hover = useGame((s) => s.hover);
  const xp = useGame((s) => s.xp);
  const lvl = levelFromXp(xp);
  const next = xpForLevel(lvl + 1);
  const prev = xpForLevel(lvl);
  const pct = Math.min(100, ((xp - prev) / Math.max(1, next - prev)) * 100);
  return (
    <div className="pointer-events-auto hidden items-center gap-3 px-4 pb-3 lg:flex">
      <Panel className="flex items-center gap-2 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Kartensteuerung</span>
        <Mini key="d" icon={<RotateCw className="size-3.5" />} label="Drehen" />
        <Mini icon={<ZoomIn className="size-3.5" />} label="Zoomen" />
        <Mini icon={<Mountain className="size-3.5" />} label="Neigen" />
        <Mini icon={<Crosshair className="size-3.5" />} label="Auswahl" />
      </Panel>
      <Panel className="flex items-center gap-2 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Bau-Modus</span>
        <Chip ok={hover?.valid !== false} label={hover?.reason || (phase === "idle" ? "Bereit" : "Bauen")} />
      </Panel>
      <Panel className="flex flex-1 items-center gap-3 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Level {lvl}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ice">
          <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] tabular-nums text-muted">
          {fmt(xp)} / {fmt(next)}
        </span>
      </Panel>
      <IconBtn>
        <Volume2 className="size-4" />
      </IconBtn>
      <IconBtn>
        <HelpCircle className="size-4" />
      </IconBtn>
    </div>
  );
}

function Mini({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ice px-2 py-1 text-[10px] font-medium text-navy">
      {icon}
      {label}
    </span>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${ok ? "bg-success/15 text-success" : "bg-danger/10 text-danger"}`}>
      {label}
    </span>
  );
}

function toggleSheet(current: HudSheet, next: HudSheet) {
  useGame.getState().setSheet(current === next ? "none" : next);
}

function MobileDock() {
  const sheet = useGame((s) => s.sheet);
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const phase = useGame((s) => s.phase);
  const finish = useGame((s) => s.finishPiste);
  const cancel = useGame((s) => s.cancelBuild);
  const buildItem = useGame((s) => s.buildItem);
  const weather = useGame((s) => s.weather);
  const stats = useGame((s) => s.stats);
  const item = buildItem ? BY_ID[buildItem] : null;
  const building = phase !== "idle";

  return (
    <div
      className="pointer-events-auto px-3 pt-1 lg:hidden"
      style={{ paddingBottom: "max(0.45rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <div className="rounded-full bg-panel/92 px-2.5 py-1 text-[10px] font-medium text-muted shadow-[var(--shadow-chip)]">
          {weather.label} · {weather.tempC}°
        </div>
        <div className="rounded-full bg-panel/92 px-2.5 py-1 text-[10px] font-semibold tabular-nums text-navy shadow-[var(--shadow-chip)]">
          {fmtCompact(stats.peoplePerHour)}/h · {stats.satisfaction}%
        </div>
      </div>
      <div className="flex items-center gap-1.5 rounded-[22px] bg-panel/95 p-1.5 shadow-[var(--shadow-panel)] backdrop-blur-md">
        {building ? (
          <>
            <div className="min-w-0 flex-1 px-2">
              <div className="truncate text-[11px] font-semibold text-navy">{item?.name ?? "Bauen"}</div>
              <div className="truncate text-[10px] text-muted">
                {phase === "lift-a" ? "Talstation tippen" : phase === "lift-b" ? "Bergstation tippen" : phase === "piste" ? "Hang tippen" : "Platz wählen"}
              </div>
            </div>
            {phase === "piste" && (
              <button
                type="button"
                onClick={finish}
                className="flex h-11 items-center gap-1 rounded-full bg-success px-3.5 text-[12px] font-semibold text-panel"
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

function MobileFloats() {
  const sheet = useGame((s) => s.sheet);
  const selectedId = useGame((s) => s.selectedId);
  const tutorialOpen = useGame((s) => s.tutorialOpen);
  const phase = useGame((s) => s.phase);
  const notes = useGame((s) => s.notifications);
  const buildings = useGame((s) => s.buildings);
  const lifts = useGame((s) => s.lifts);
  const selectEntity = useGame((s) => s.selectEntity);
  const setSheet = useGame((s) => s.setSheet);
  const [hiddenNote, setHiddenNote] = useState<string | null>(null);
  const note = notes[0] && notes[0].id !== hiddenNote ? notes[0] : null;
  const showTutorial = tutorialOpen && sheet === "none" && phase === "idle" && !selectedId;
  const showSelected = !!selectedId && sheet === "none" && phase === "idle";
  const lift = lifts.find((l) => l.id === selectedId);
  const b = buildings.find((x) => x.id === selectedId);
  const selectedItem = lift ? BY_ID[lift.itemId] : b ? BY_ID[b.itemId] : null;

  if (sheet !== "none") return null;

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-2 z-20 hidden flex-col gap-2 max-lg:flex">
      {note && !showTutorial && phase === "idle" && (
        <div className="toast-in pointer-events-auto mx-auto flex w-full max-w-sm items-start gap-2 rounded-[16px] bg-panel/95 px-3 py-2 shadow-[var(--shadow-panel)]">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-navy">{note.title}</div>
            <div className="text-[11px] leading-snug text-muted">{note.body}</div>
          </div>
          <button
            type="button"
            aria-label="Hinweis schliessen"
            className="grid size-11 shrink-0 place-items-center rounded-full text-muted"
            onClick={() => setHiddenNote(note.id)}
          >
            <X className="size-4" />
          </button>
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
          <img src="/textures/station.jpg" alt="" className="size-11 rounded-[12px] object-cover" />
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
  const title = sheet === "build" ? "Bauen" : sheet === "quests" ? "Ziele" : sheet === "info" ? "Gebiet" : "Menü";
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
          {sheet === "quests" && <Quests />}
          {sheet === "info" && <InfoPanel />}
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
          const Icon = ITEM_ICON[it.id] ?? CAT_ICON[it.category];
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setBuildItem(it.id)}
              className="min-h-[5.5rem] rounded-[16px] bg-snow p-3 text-left"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-[10px] bg-ice text-navy">
                  <Icon className="size-4" />
                </span>
                {locked && <span className="text-[10px] font-semibold text-subtle">Lv {it.unlockLevel}</span>}
              </div>
              <div className="text-[13px] font-semibold text-navy">{it.name}</div>
              <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted">{it.blurb}</div>
              <div className="mt-2 flex items-center gap-1 text-[12px] font-semibold text-coin">
                <Coin className="size-3.5" /> {fmt(it.cost)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MobileMenuBody() {
  const persist = useGame((s) => s.persist);
  const setSheet = useGame((s) => s.setSheet);
  const quality = useGame((s) => s.quality);
  const xp = useGame((s) => s.xp);
  const lvl = levelFromXp(xp);
  const next = xpForLevel(lvl + 1);
  const prev = xpForLevel(lvl);
  const pct = Math.min(100, ((xp - prev) / Math.max(1, next - prev)) * 100);
  return (
    <div className="flex flex-col gap-3 pb-2">
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-navy">
          <span>Level {lvl}</span>
          <span className="tabular-nums text-muted">
            {fmt(xp)} / {fmt(next)}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ice">
          <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      </div>
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
        onClick={() => {
          persist();
          setSheet("none");
        }}
      >
        Spielstand speichern
      </button>
      <button
        type="button"
        className="flex min-h-12 w-full items-center rounded-[16px] bg-ice px-4 text-left text-[13px] font-medium text-navy"
        onClick={() => exportSave(useGame.getState())}
      >
        Spielstand exportieren
      </button>
    </div>
  );
}

function MenuSheet() {
  const persist = useGame((s) => s.persist);
  const setSheet = useGame((s) => s.setSheet);
  const quality = useGame((s) => s.quality);
  return (
    <div className="absolute right-3 top-14 z-30 w-64 rounded-[18px] bg-panel p-3 shadow-[var(--shadow-panel)]">
      <div className="text-[12px] font-semibold text-navy">Einstellungen</div>
      <button
        type="button"
        className="mt-2 w-full rounded-[12px] bg-ice px-3 py-2 text-left text-[12px]"
        onClick={() => useGame.setState({ quality: quality === "high" ? "low" : "high" })}
      >
        Grafik: {quality === "high" ? "Hoch" : "Sparsam"}
      </button>
      <button
        type="button"
        className="mt-1 w-full rounded-[12px] bg-ice px-3 py-2 text-left text-[12px]"
        onClick={() => {
          persist();
          setSheet("none");
        }}
      >
        Spielstand speichern
      </button>
      <button
        type="button"
        className="mt-1 w-full rounded-[12px] bg-ice px-3 py-2 text-left text-[12px]"
        onClick={() => {
          exportSave(useGame.getState());
        }}
      >
        Spielstand exportieren
      </button>
    </div>
  );
}

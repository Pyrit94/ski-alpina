import type { ReactNode } from "react";
import { useState } from "react";
import { peerColor } from "@/lib/game/players";
import { BY_ID } from "@/lib/game/catalog";
import { useCardImages } from "@/lib/game/card-images";
import { useGame } from "@/lib/game/store";
import type { ItemId, MapLayer } from "@/lib/game/types";
import { CAT_ICON, ITEM_ICON } from "./hud-shared";

export function PlayersLine() {
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

export function Coin({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#F4B942" />
      <circle cx="12" cy="12" r="7.2" fill="#ffe08a" />
      <path d="M12 7.2v9.6M9.2 9.4c.6-1 2.6-1.2 3.6-.2.8.8.7 2.1-.3 2.7-1 .6-2.6.5-3.3 1.4-.5.6 0 1.8 1.6 2.1 1.4.3 2.7-.3 3.2-1.1" stroke="#b8860b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A photo for an item when Get-Textures.ps1 has fetched one, else its icon.
 * A photo that fails to load falls back to the icon too.
 */
export function ItemThumb({ id, className, iconClass = "size-4" }: { id: ItemId; className: string; iconClass?: string }) {
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

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`pointer-events-auto rounded-[22px] bg-panel/92 shadow-[var(--shadow-panel)] backdrop-blur-md ${className}`}>
      {children}
    </div>
  );
}

export function LayerTabs() {
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

export function Warning({ tone, children }: { tone: "warn" | "bad"; children: React.ReactNode }) {
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
export function Stat({
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

/**
 * A round HUD button with its label under it, as city builders have them:
 * the whole circle is the target, 56 px on a phone.
 */
export function RoundButton({
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

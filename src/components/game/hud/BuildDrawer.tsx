import { Lock, Hammer, X, FlaskConical, Sparkles } from "lucide-react";
import { CATALOG, CATEGORIES } from "@/lib/game/catalog";
import { RESEARCH_BY_ID } from "@ski/config";
import { useMyMoney } from "@/lib/game/team";
import { openAutoPistes } from "@/lib/game/auto-pistes";
import { useBuildTerms } from "@/lib/game/research";
import { useGame } from "@/lib/game/store";
import { SHORT_CAT, CAT_ICON, priceLabel } from "./hud-shared";
import { Coin, ItemThumb } from "./HudBits";

/** The big Bauen button, bottom right, as in a city builder. */
export function BigBuildButton() {
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
 * The build menu of a city builder: round category buttons along the bottom,
 * and above them the items of that category as cards to swipe through. A tap
 * on a card picks it up; the drawer folds away and the map is free to build.
 */
export function BuildDrawer() {
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
                    <span className="absolute inset-0 grid place-items-center bg-snow/85 px-1.5 text-center text-[11px] font-bold">
                      {terms.lock(it.id)?.kind === "research" ? (
                        <span className="flex flex-col items-center gap-0.5 text-accent">
                          <FlaskConical className="size-5" />
                          <span className="line-clamp-2 leading-tight">{RESEARCH_BY_ID[(terms.lock(it.id) as { nodeId: string }).nodeId]?.name}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted">
                          <Lock className="size-4" /> Level {it.unlockLevel}
                        </span>
                      )}
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


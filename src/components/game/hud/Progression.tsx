import type { ReactNode } from "react";
import { Check, ChevronRight, Flag, Gift, Star, Trophy } from "lucide-react";
import { RANK, WELTCUP, type LongGoalMetric } from "@ski/config";
import { fromAbsDay, recordLabel, rewardText, weltcupToday, type RankFactorView, type SeasonSummary } from "@ski/shared";
import { fmt, fmtCompact, fmtSigned } from "@/lib/game/format";
import { deltaPct, seasonPair, useLongGoals, useRank } from "@/lib/game/progression";
import { useGame } from "@/lib/game/store";
import { Panel } from "./HudBits";
import { Modal, PrimaryButton } from "./MatchHUD";

/**
 * Free-play progression in the HUD: the rank up top and in Betrieb, the
 * «Saisonbilanz» card at each season's end, the long-term goals in Ziele.
 * Matches keep their own medals, so none of it shows during one.
 */

function Stars({ n, className = "size-3.5" }: { n: number; className?: string }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {RANK.tiers.map((t, i) => (
        <Star key={t.id} className={`${className} ${i < n ? "fill-star text-star" : "text-line"}`} />
      ))}
    </span>
  );
}

/**
 * The rank: the star count in a ring that fills towards the next tier, and
 * the tier's name. Up in the top bar on a desktop; on a phone, whose top bar
 * is full, it floats top left over the map (see GameHUD). Opens Betrieb.
 */
export function RankChip() {
  const mode = useGame((s) => s.match.mode);
  const setSheet = useGame((s) => s.setSheet);
  const rank = useRank();
  if (mode === "match") return null;
  const stars = rank.tier + 1;
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <button
      type="button"
      onClick={() => setSheet("info")}
      aria-label={`Gebietsrang ${rank.name}, ${stars} von ${RANK.tiers.length} Sternen`}
      title={`Gebietsrang: ${rank.name}${rank.nextName ? ` · ${Math.round(rank.toNext * 100)} % bis ${rank.nextName}` : ""}`}
      className="pointer-events-auto relative flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-panel/92 p-1 pr-3 shadow-[var(--shadow-chip)] before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']"
    >
      <span className="relative">
        <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
          <circle cx="14" cy="14" r={r} fill="var(--color-ice)" stroke="var(--color-line)" strokeWidth="3" />
          <circle
            cx="14"
            cy="14"
            r={r}
            fill="none"
            stroke="var(--color-star)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${c * rank.toNext} ${c}`}
            transform="rotate(-90 14 14)"
          />
          <text x="14" y="18" textAnchor="middle" className="fill-navy text-[11px] font-bold">
            {stars}
          </text>
        </svg>
        <Star className="absolute -right-1 -top-1 size-3 fill-star text-star" aria-hidden />
      </span>
      <span className="max-w-[10rem] truncate text-[11px] font-semibold text-navy">{rank.name}</span>
    </button>
  );
}

function factorValue(f: RankFactorView): string {
  switch (f.id) {
    case "guests":
      return fmtCompact(f.value);
    case "satisfaction":
      return `${Math.round(f.value)} %`;
    case "pisteKm":
      return `${f.value.toLocaleString("de-CH")} km`;
    case "pistePoints":
      return `${Math.round(f.value)} Pkt.`;
    case "variety":
      return `${f.value} von 4`;
    case "beds":
      return fmt(f.value);
    case "share":
      return `${Math.round(f.value * 100)} %`;
  }
}

/** «Gebietsrang» in Betrieb: tier, the way to the next, what helps, and past seasons. */
export function RankPanel() {
  const mode = useGame((s) => s.match.mode);
  const seasons = useGame((s) => s.progress?.seasons) ?? [];
  const showBilanz = useGame((s) => s.showBilanz);
  const rank = useRank();
  if (mode === "match") return null;
  const left = rank.nextMin !== null ? Math.max(0, Math.ceil(rank.nextMin - rank.score)) : 0;
  return (
    <Panel className="p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Gebietsrang</span>
        <span className="value text-[10px] text-subtle">{Math.round(rank.score)} / 100 Punkte</span>
      </div>
      <div className="flex items-center gap-2">
        <Stars n={rank.tier + 1} className="size-4" />
        <span className="min-w-0 truncate text-[15px] font-bold text-navy">{rank.name}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ice">
        <div className="h-full rounded-full bg-star" style={{ width: `${Math.round(rank.toNext * 100)}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-muted">
        {rank.nextName ? (
          <>
            Noch <span className="value font-semibold text-navy">{left}</span> Punkte bis <span className="font-semibold text-navy">{rank.nextName}</span>
          </>
        ) : (
          "Höchster Rang erreicht."
        )}
      </div>
      {rank.helps.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="font-semibold text-navy">Am meisten hilft:</span>
          {rank.helps.map((h) => (
            <span key={h.id} className="rounded-full bg-accent/10 px-2 py-0.5 font-semibold text-accent">
              {h.hint}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2.5 grid grid-cols-1 gap-1">
        {rank.factors.map((f) => (
          <div key={f.id} className="grid grid-cols-[7.5rem_1fr_3.6rem] items-center gap-2 text-[10px]">
            <span className="truncate text-muted">{f.label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-ice">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(f.share * 100)}%` }} />
            </span>
            <span className="value text-right font-semibold text-navy">{factorValue(f)}</span>
          </div>
        ))}
      </div>
      {rank.gate < 1 && (
        <p className="mt-2 text-[10px] text-muted">
          {RANK.factors
            .filter((f) => f.gated)
            .map((f) => f.label)
            .join(", ")}{" "}
          zählen erst ab {RANK.gateKm} km Piste voll, jetzt zu {Math.round(rank.gate * 100)} %.
        </p>
      )}
      {seasons.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Saisonbilanzen</div>
          <div className="flex flex-wrap gap-1.5">
            {seasons
              .slice(-4)
              .reverse()
              .map((s) => (
                <button
                  key={s.season}
                  type="button"
                  onClick={() => showBilanz(s.season)}
                  className="flex min-h-11 items-center gap-1 rounded-full bg-ice px-3 text-[12px] font-semibold text-navy"
                >
                  Saison {s.season}
                  <ChevronRight className="size-3.5 text-muted" />
                </button>
              ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Delta({ value, unit = "%" }: { value: number | null; unit?: string }) {
  if (value === null) return null;
  const tone = value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-muted";
  return (
    <span className={`value text-[11px] font-semibold ${tone}`}>
      {value > 0 ? "+" : value < 0 ? "−" : "±"}
      {Math.abs(value)}
      {unit === "%" ? " %" : ` ${unit}`}
    </span>
  );
}

function Figure({ label, value, delta, record }: { label: string; value: string; delta: ReactNode; record: boolean }) {
  return (
    <div className="rounded-[16px] bg-snow px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(11,31,58,.05)]">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</span>
        {record && <Trophy className="size-3.5 text-coin" aria-label="Rekord" />}
      </div>
      <div className="value mt-0.5 text-[18px] font-bold leading-none text-navy">{value}</div>
      <div className="mt-1 min-h-4">{delta}</div>
    </div>
  );
}

function ReportBody({ now, before }: { now: SeasonSummary; before: SeasonSummary | null }) {
  const tier = RANK.tiers[now.rank] ?? RANK.tiers[0]!;
  const rec = (k: Parameters<typeof recordLabel>[0]) => now.records.includes(k);
  const pp = (a: number, b: number | undefined) => (b === undefined ? null : Math.round(a - b));
  return (
    <>
      <div className="bg-gradient-to-br from-navy to-[#24508f] px-5 pb-5 pt-6 text-snow">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-soft">Saisonbilanz · {now.days} {now.days === 1 ? "Tag" : "Tage"}</div>
        <div className="mt-1 text-[22px] font-bold">Saison {now.season}</div>
        <div className="mt-2 flex items-center gap-2 text-[13px] font-semibold">
          <Stars n={now.rank + 1} className="size-4" />
          {tier.name}
          {before && now.rank > before.rank && <span className="rounded-full bg-success px-2 py-0.5 text-[10px] text-panel">Aufgestiegen</span>}
        </div>
      </div>
      <div className="p-4">
        {now.records.length > 0 && (
          <div className="mb-3 flex items-start gap-1.5 rounded-[14px] bg-coin/15 px-3 py-2 text-[12px] font-semibold text-navy">
            <Trophy className="size-4 shrink-0 text-coin" />
            <span>Neuer Rekord: {now.records.map(recordLabel).join(", ")}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Figure label="Gäste" value={fmt(now.guests)} delta={<Delta value={deltaPct(now.guests, before?.guests)} />} record={rec("guests")} />
          <Figure label="Umsatz" value={`${fmtCompact(now.revenue)} CHF`} delta={<Delta value={deltaPct(now.revenue, before?.revenue)} />} record={rec("revenue")} />
          <Figure label="Gewinn" value={`${fmtSigned(now.profit)}`} delta={<Delta value={deltaPct(now.profit, before?.profit)} />} record={rec("profit")} />
          <Figure label="Bester Tag" value={`${fmt(now.bestDay)} Gäste`} delta={<Delta value={deltaPct(now.bestDay, before?.bestDay)} />} record={rec("bestDay")} />
          <Figure label="Ø Zufriedenheit" value={`${now.satisfaction} %`} delta={<Delta value={pp(now.satisfaction, before?.satisfaction)} unit="Pkt." />} record={rec("satisfaction")} />
          <Figure
            label="Marktanteil"
            value={`${Math.round(now.share * 100)} %`}
            delta={<Delta value={pp(now.share * 100, before === null ? undefined : before.share * 100)} unit="Pkt." />}
            record={false}
          />
        </div>
        <p className="mt-3 text-[11px] text-muted">
          {before ? `Verglichen mit Saison ${before.season}.` : "Die erste Bilanz: nächste Saison zeigt sie, was sich verändert hat."} Alle Bilanzen
          findest du unter Betrieb.
        </p>
      </div>
    </>
  );
}

/** «Saisonbilanz»: once per finished season, and again from Betrieb. */
export function SeasonReportModal() {
  const season = useGame((s) => s.bilanzSeason);
  const seasons = useGame((s) => s.progress?.seasons);
  const showBilanz = useGame((s) => s.showBilanz);
  if (season === null || !seasons) return null;
  const pair = seasonPair(seasons, season);
  if (!pair) return null;
  const close = () => showBilanz(null);
  return (
    <Modal onClose={close}>
      <ReportBody now={pair.now} before={pair.before} />
      <div className="px-4 pb-4">
        <PrimaryButton onClick={close}>
          Weiter <ChevronRight className="size-4" />
        </PrimaryButton>
      </div>
    </Modal>
  );
}

/** A need's figure and unit, e.g. ["2'687", "m"]. */
function needParts(metric: LongGoalMetric, v: number): [string, string] {
  switch (metric) {
    case "blackRunKm":
      return [v.toLocaleString("de-CH", { maximumFractionDigits: 1 }), "km"];
    case "raceRunPoints":
      return [`${Math.round(v)}`, "Pkt."];
    case "topStationM":
      return [fmt(v), "m"];
    case "beds":
    case "seasonGuests":
      return [fmtCompact(v), ""];
    case "neighboursOpen":
      return [`${v}`, ""];
  }
}

function needText(metric: LongGoalMetric, value: number, target: number): string {
  const [v, unit] = needParts(metric, value);
  if (metric === "neighboursOpen") return `noch ${v}`;
  const [t] = needParts(metric, target);
  return `${v} / ${t}${unit ? ` ${unit}` : ""}`;
}

function WeltcupLine() {
  const weltcup = useGame((s) => s.progress?.weltcup);
  const season = useGame((s) => s.season);
  const day = useGame((s) => s.day);
  const progress = useGame((s) => s.progress);
  if (!weltcup) return null;
  const at = fromAbsDay(weltcup.day);
  const today = weltcupToday({ progress, season, day });
  return (
    <div className={`mt-1.5 flex items-center gap-1.5 rounded-[12px] px-2.5 py-1.5 text-[11px] font-semibold ${weltcup.held ? "bg-success/12 text-success" : "bg-coin/15 text-navy"}`}>
      <Flag className="size-3.5 shrink-0" />
      {weltcup.held
        ? "Weltcup-Rennen ausgetragen."
        : today
          ? `Heute ist Renntag: ×${WELTCUP.demand} Gäste!`
          : `Renntag: Saison ${at.season}, Tag ${at.day} (×${WELTCUP.demand} Gäste).`}
    </div>
  );
}

/** «Fernziele» in Ziele: the long-term goals with their progress. */
export function LongGoalsPanel() {
  const mode = useGame((s) => s.match.mode);
  const goals = useLongGoals();
  if (mode === "match") return null;
  return (
    <Panel className="p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Fernziele</div>
      <div className="flex flex-col gap-3">
        {goals.map((g) => (
          <div key={g.def.id} className={g.done ? "opacity-80" : ""}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[12px] font-bold text-navy">
                  {g.done && (
                    <span className="grid size-4 place-items-center rounded-full bg-success">
                      <Check className="size-3 text-panel" />
                    </span>
                  )}
                  {g.def.title}
                </div>
                <div className="text-[10px] text-muted">{g.unavailable ? "Nur mit Nachbarn: im Menü einschalten." : g.def.hint}</div>
              </div>
              <span className="value shrink-0 text-[11px] font-bold text-navy">{Math.round(g.share * 100)} %</span>
            </div>
            {!g.done && !g.unavailable && (
              <div className="mt-1.5 flex flex-col gap-1">
                {g.def.needs.map((need, i) => {
                  const v = g.needs[i]!;
                  return (
                    <div key={need.metric} className="text-[10px]">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-muted">{need.label}</span>
                        <span className={`value shrink-0 whitespace-nowrap font-semibold ${v.met ? "text-success" : "text-navy"}`}>
                          {v.met && <Check className="mr-0.5 inline size-3" />}
                          {needText(need.metric, v.value, need.target)}
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ice">
                        <div className={`h-full rounded-full ${v.met ? "bg-success" : "bg-accent"}`} style={{ width: `${Math.round(v.share * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-navy">
              <Gift className="size-3.5 shrink-0 text-coin" />
              {g.done ? "Erreicht und belohnt" : `Belohnung: ${rewardText(g.def.reward)}`}
            </div>
            {g.def.event === "weltcup" && <WeltcupLine />}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Race day, in Betrieb: why there are so many guests today. */
export function WeltcupBanner() {
  const progress = useGame((s) => s.progress);
  const season = useGame((s) => s.season);
  const day = useGame((s) => s.day);
  if (!weltcupToday({ progress, season, day })) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1.5 rounded-[12px] bg-coin/15 px-2.5 py-1.5 text-[11px] font-semibold text-navy">
      <Flag className="size-3.5 shrink-0 text-coin" /> Weltcup-Renntag: ×{WELTCUP.demand} Nachfrage – die Welt schaut zu.
    </div>
  );
}

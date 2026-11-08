import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudLightning,
  Flag,
  Hourglass,
  Medal as MedalIcon,
  Play,
  Snowflake,
  Sparkles,
  Sun,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { MATCH } from "@ski/config";
import { DEFAULT_MATCH_OPTIONS, duelScores, scoreBreakdown, secretGoalResults, weatherForDay, type MatchOptions, type Medal, type RoundReport, type WeatherKind } from "@ski/shared";
import { fmt, fmtSigned } from "@/lib/game/format";
import { peerColor } from "@/lib/game/players";
import { useGame } from "@/lib/game/store";
import { useMyMoney, useResortView } from "@/lib/game/team";
import { itemUnlocked } from "@ski/shared";
import { useResortLinks } from "@/lib/game/links";
import { nextStep } from "@/lib/game/next-step";
import { runStepAction } from "@/lib/game/step-actions";
import { RulesEditor, VoteStatus } from "./RulesHUD";
import { AlbumView } from "./AlbumHUD";
import { AwardsPanel } from "./TeamHUD";

const WEATHER_ICON: Record<WeatherKind, typeof Sun> = {
  sun: Sun,
  cloud: Cloud,
  snow: Snowflake,
  fog: CloudFog,
  storm: CloudLightning,
};

const WEATHER_TINT: Record<WeatherKind, string> = {
  sun: "text-coin",
  cloud: "text-muted",
  snow: "text-accent",
  fog: "text-subtle",
  storm: "text-danger",
};

const MEDAL_LABEL: Record<Medal, string> = { gold: "Gold", silber: "Silber", bronze: "Bronze" };
const MEDAL_COLOR: Record<Medal, string> = { gold: "#E8B530", silber: "#A9B4C2", bronze: "#C27C4A" };

export function MedalBadge({ medal, size = "md" }: { medal: Medal; size?: "sm" | "md" | "lg" }) {
  const px = size === "lg" ? "size-14" : size === "sm" ? "size-6" : "size-9";
  const icon = size === "lg" ? "size-7" : size === "sm" ? "size-3.5" : "size-5";
  return (
    <span
      className={`grid ${px} shrink-0 place-items-center rounded-full text-panel shadow-[inset_0_-3px_0_rgba(0,0,0,.18),0_4px_12px_-4px_rgba(11,31,58,.4)]`}
      style={{ background: MEDAL_COLOR[medal] }}
      title={MEDAL_LABEL[medal]}
    >
      <MedalIcon className={icon} />
    </span>
  );
}

function Modal({ children, onClose, wide = false }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 grid place-items-center p-3">
      <button
        type="button"
        aria-label="Schliessen"
        className="absolute inset-0 bg-navy/45 backdrop-blur-[2px]"
        onClick={onClose}
        disabled={!onClose}
      />
      <div
        className={`pop-in relative max-h-[92dvh] w-full overflow-y-auto rounded-[28px] bg-panel shadow-[var(--shadow-panel)] ${wide ? "max-w-xl" : "max-w-md"}`}
      >
        {onClose && (
          <button
            type="button"
            aria-label="Schliessen"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-panel/80 text-muted"
          >
            <X className="size-5" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

function BigStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  const color = tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-navy";
  return (
    <div className="rounded-[16px] bg-snow px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(11,31,58,.05)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className={`value mt-0.5 text-[20px] font-bold leading-none ${color}`}>{value}</div>
    </div>
  );
}

function PrimaryButton({ children, onClick, tone = "accent", disabled }: { children: ReactNode; onClick: () => void; tone?: "accent" | "success" | "light"; disabled?: boolean }) {
  const cls =
    tone === "success"
      ? "bg-success text-panel"
      : tone === "light"
        ? "btn-3d-light bg-ice text-navy"
        : "bg-accent text-panel";
  const lip = tone === "success" ? "#23803f" : tone === "accent" ? "var(--color-accent-dark)" : undefined;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`btn-3d flex h-12 w-full items-center justify-center gap-1.5 rounded-full px-5 text-[14px] font-bold ${cls}`}
      style={lip ? { ["--lip" as string]: lip } : undefined}
    >
      {children}
    </button>
  );
}

/** The days of this round, as the forecast shows them. */
function useForecast(): WeatherKind[] {
  const season = useGame((s) => s.season);
  const day = useGame((s) => s.day);
  const days = useGame((s) => s.match.daysPerRound);
  return useMemo(
    () => Array.from({ length: days || 0 }, (_, i) => weatherForDay(season, day + i).kind),
    [season, day, days],
  );
}

function WeatherStrip({ kinds, size = "sm" }: { kinds: WeatherKind[]; size?: "sm" | "md" }) {
  const cls = size === "md" ? "size-4" : "size-3.5";
  return (
    <span className="inline-flex items-center gap-0.5">
      {kinds.map((k, i) => {
        const Icon = WEATHER_ICON[k];
        return <Icon key={i} className={`${cls} ${WEATHER_TINT[k]}`} />;
      })}
    </span>
  );
}

/** Guests this season against the medal marks. */
function SeasonGoalBar({ compact = false, narrow = false, bare = false }: { compact?: boolean; narrow?: boolean; bare?: boolean }) {
  const goals = useGame((s) => s.match.goals);
  const season = useGame((s) => s.season);
  const goal = goals.find((g) => g.season === season) ?? goals[goals.length - 1];
  if (!goal) return null;
  const pct = (n: number) => Math.min(100, (n / goal.gold) * 100);
  const reached: Medal | null =
    goal.guests >= goal.gold ? "gold" : goal.guests >= goal.silber ? "silber" : goal.guests >= goal.bronze ? "bronze" : null;
  const ahead = nextMedal(goal);
  return (
    <div className={compact && !bare ? (narrow ? "w-24" : "w-40") : "w-full"}>
      {!compact && (
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="font-semibold text-navy">Saisonziel {goal.season}</span>
          <span className="value text-muted">
            {fmt(goal.guests)} / {fmt(goal.gold)} Gäste
          </span>
        </div>
      )}
      <div className="relative h-2 rounded-full bg-ice">
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-success transition-[width] duration-700" style={{ width: `${pct(goal.guests)}%` }} />
        {(["bronze", "silber", "gold"] as Medal[]).map((m) => (
          <span
            key={m}
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel"
            style={{ left: `${pct(goal[m])}%`, background: MEDAL_COLOR[m] }}
            title={`${MEDAL_LABEL[m]}: ${fmt(goal[m])} Gäste`}
          />
        ))}
      </div>
      {compact && !bare && (
        <div className="mt-0.5 truncate text-[9px] font-semibold text-muted">
          {ahead ? `noch ${fmt(ahead.missing)} bis ${MEDAL_LABEL[ahead.medal]}` : "Gold erreicht!"}
        </div>
      )}
      {!compact && (
        <div className="mt-1 text-[10px] text-muted">
          {reached ? `${MEDAL_LABEL[reached]} ist erreicht. ` : ""}
          Bronze {fmt(goal.bronze)} · Silber {fmt(goal.silber)} · Gold {fmt(goal.gold)}
        </div>
      )}
    </div>
  );
}

/** The next medal of a season and how many guests are still missing for it. */
function nextMedal(goal: { guests: number; bronze: number; silber: number; gold: number }): { medal: Medal; missing: number } | null {
  for (const m of ["bronze", "silber", "gold"] as Medal[]) {
    if (goal.guests < goal[m]) return { medal: m, missing: Math.ceil(goal[m] - goal.guests) };
  }
  return null;
}

/**
 * The round's control: where you are, what the sky will do, and the button
 * that hands the round over to the simulation.
 */
export function RoundBar({ mobile = false }: { mobile?: boolean }) {
  const match = useGame((s) => s.match);
  const day = useGame((s) => s.day);
  const season = useGame((s) => s.season);
  const players = useGame((s) => s.players);
  const me = useGame((s) => s.playerId);
  const endRound = useGame((s) => s.endRound);
  const openSetup = useGame((s) => s.setMatchSetupOpen);
  const forecast = useForecast();

  const shell = mobile
    ? "pointer-events-auto mb-1.5 flex w-full items-center gap-2 rounded-[20px] bg-panel/95 p-1.5 pl-3 shadow-[var(--shadow-panel)] backdrop-blur-md"
    : "pointer-events-auto flex items-center gap-3 rounded-full bg-panel/95 py-1.5 pl-4 pr-1.5 shadow-[var(--shadow-panel)] backdrop-blur-md";

  if (match.mode !== "match") {
    return (
      <div className={shell}>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[12px] font-bold text-navy">Freies Spiel</div>
          <div className="text-[10px] text-muted">Die Zeit läuft, solange jemand da ist.</div>
        </div>
        <button
          type="button"
          onClick={() => openSetup(true)}
          className="btn-3d flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-[12px] font-bold text-panel"
          style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
        >
          <Flag className="size-4" /> Partie starten
        </button>
      </div>
    );
  }

  if (match.phase === "finished") {
    return (
      <div className={shell}>
        <Trophy className="size-5 shrink-0 text-coin" />
        <div className="min-w-0 flex-1 text-[12px] font-bold text-navy">Partie beendet · {fmt(match.score)} Punkte</div>
        <button
          type="button"
          onClick={() => useGame.setState({ seenReportRound: -2 })}
          className="btn-3d flex h-10 shrink-0 items-center gap-1 rounded-full bg-accent px-4 text-[12px] font-bold text-panel"
          style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
        >
          Endstand <ChevronRight className="size-4" />
        </button>
      </div>
    );
  }

  const others = players.filter((p) => p.id !== me);
  const iAmReady = me ? match.ready.includes(me) : false;
  const waitingFor = others.filter((p) => !match.ready.includes(p.id));
  const label = iAmReady
    ? waitingFor.length
      ? `Warte auf ${waitingFor.map((p) => p.name).join(", ")}`
      : "Wird gespielt…"
    : others.length === 0
      ? "Runde spielen"
      : "Runde beenden";
  const readyOthers = others.filter((p) => match.ready.includes(p.id));

  return (
    <div className={shell}>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-2">
          <span className="value text-[13px] font-bold text-navy">
            Runde {match.round}
            <span className="font-medium text-muted">/{match.roundsTotal}</span>
          </span>
          {!mobile && (
            <span className="text-[11px] text-muted">
              Saison {season} · Tag {day}–{day + match.daysPerRound - 1}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {!mobile && <WeatherStrip kinds={forecast} />}
          <SeasonGoalBar compact narrow={mobile} />
        </div>
      </div>
      {!mobile && others.length > 0 && (
        <span
          title={`Bauen beide in einer Runde, gibt es ${fmt(MATCH.teamwork.coins)} CHF und ${MATCH.teamwork.stars} Stern extra.`}
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
            new Set(match.roundBuilders).size >= 2 ? "bg-success/12 text-success" : "bg-ice text-muted"
          }`}
        >
          {new Set(match.roundBuilders).size >= 2 ? "Teamwork ✓" : "Teamwork-Bonus offen"}
        </span>
      )}
      {readyOthers.length > 0 && !iAmReady && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/12 px-2 py-1 text-[10px] font-bold text-success">
          {readyOthers.map((p) => (
            <span key={p.id} className="size-2 rounded-full" style={{ background: peerColor(p.id) }} />
          ))}
          bereit
        </span>
      )}
      <button
        type="button"
        onClick={() => endRound(!iAmReady)}
        className={`btn-3d flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold ${
          iAmReady ? "btn-3d-light bg-ice text-navy" : "bg-success text-panel"
        }`}
        style={iAmReady ? undefined : { ["--lip" as string]: "#23803f" }}
        title={iAmReady ? "Antippen, um weiterzubauen" : "Die Runde wird gespielt, sobald alle Anwesenden bereit sind"}
      >
        {iAmReady ? <Hourglass className="size-4" /> : <Play className="size-4" />}
        <span className="max-w-[11rem] truncate">{label}</span>
      </button>
    </div>
  );
}

/** A decision for the round, put to whoever looks first. */
export function EventCard() {
  const event = useGame((s) => s.match.event);
  const phase = useGame((s) => s.match.phase);
  const mode = useGame((s) => s.match.mode);
  const choose = useGame((s) => s.chooseEvent);
  const voting = useGame((s) => s.match.options.events === "vote");
  const me = useGame((s) => s.playerId);
  const money = useMyMoney();
  const contributors = useGame((s) => s.contributors);
  const [folded, setFolded] = useState(false);
  if (mode !== "match" || phase !== "plan" || !event) return null;

  if (event.chosen !== null) {
    const who = event.chosenBy ? contributors[event.chosenBy]?.name : null;
    return (
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-panel/95 px-3 py-1.5 text-[11px] shadow-[var(--shadow-chip)]">
        <Sparkles className="size-3.5 text-coin" />
        <span className="font-semibold text-navy">{event.title}:</span>
        <span className="text-muted">
          {event.options[event.chosen]?.label}
          {who ? ` (${who})` : ""}
        </span>
      </div>
    );
  }

  if (folded) {
    return (
      <button
        type="button"
        onClick={() => setFolded(false)}
        className="pointer-events-auto flex min-h-10 items-center gap-2 rounded-full bg-coin px-3 text-[12px] font-bold text-navy shadow-[var(--shadow-chip)]"
      >
        <Sparkles className="size-4" /> Entscheid offen: {event.title}
      </button>
    );
  }

  return (
    <div className="pop-in pointer-events-auto w-[min(100%,26rem)] overflow-hidden rounded-[24px] bg-panel shadow-[var(--shadow-panel)]">
      <div className="flex items-start gap-3 bg-gradient-to-br from-[#FFF6DD] to-panel p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-coin text-navy">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wide text-warn">Ereignis dieser Runde</div>
          <div className="text-[16px] font-bold text-navy">{event.title}</div>
          <p className="mt-1 text-[12px] leading-snug text-muted">{event.body}</p>
        </div>
        <button type="button" aria-label="Später" onClick={() => setFolded(true)} className="grid size-9 shrink-0 place-items-center rounded-full text-muted">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2">
        {event.options.map((o, i) => {
          const affordable = voting || money.mine >= (o.cost ?? 0);
          const myVote = voting && me ? event.votes?.[me] === i : false;
          return (
            <button
              key={o.label}
              type="button"
              disabled={!affordable}
              onClick={() => choose(i)}
              aria-pressed={myVote}
              className={`btn-3d ${i === 0 ? "" : "btn-3d-light"} flex min-h-16 flex-col items-start justify-center rounded-[16px] px-3 py-2 text-left disabled:opacity-50 ${
                i === 0 ? "bg-accent text-panel" : "bg-ice text-navy"
              }`}
              style={i === 0 ? { ["--lip" as string]: "var(--color-accent-dark)" } : undefined}
            >
              <span className="text-[13px] font-bold">
                {o.label}
                {myVote ? " ✓ deine Stimme" : ""}
              </span>
              <span className={`text-[11px] leading-snug ${i === 0 ? "text-panel/85" : "text-muted"}`}>
                {affordable ? o.detail : "Zu wenig Geld"}
              </span>
            </button>
          );
        })}
      </div>
      <VoteStatus />
      <div className="px-4 pb-3 text-[10px] text-subtle">
        {voting ? "Ihr stimmt beide ab. Ohne Stimmen gilt die zweite Wahl." : "Ohne Entscheid gilt die zweite Wahl."}
      </div>
    </div>
  );
}

function ReportWallets({ wallets }: { wallets: Record<string, number> }) {
  const contributors = useGame((s) => s.contributors);
  const label = (k: string) => (k === "berg" ? "Berg" : k === "tal" ? "Tal" : (contributors[k]?.name ?? "?"));
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {Object.entries(wallets).map(([k, v]) => (
        <span key={k} className="rounded-full bg-snow px-2.5 py-1 text-[11px] text-navy">
          Kasse {label(k)}: <b className="value">{fmt(v)}</b>
        </span>
      ))}
    </div>
  );
}

function ReportBody({ report, history = [], onAction }: { report: RoundReport; history?: RoundReport[]; onAction?: () => void }) {
  const earlier = history.filter((r) => r.round < report.round);
  const prev = earlier.length > 0 ? earlier[earlier.length - 1] : undefined;
  const goals = useGame((s) => s.match.goals);
  const goal = goals.find((g) => g.season === report.season);
  const ahead = goal && !report.medal ? nextMedal(goal) : null;
  const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / Math.abs(before)) * 100) : null);
  const records: string[] = [];
  if (earlier.length > 0) {
    if (report.guests > Math.max(...earlier.map((r) => r.guests))) records.push("Rekord: so viele Gäste wie noch nie!");
    if (report.net > Math.max(...earlier.map((r) => r.net)) && report.net > 0) records.push("Rekord: bester Gewinn bisher!");
    if (report.satisfaction > Math.max(...earlier.map((r) => r.satisfaction))) records.push("Rekord: zufriedenste Gäste bisher!");
  }
  const tips: string[] = [];
  if (report.net < 0) tips.push("Der Unterhalt war höher als die Einnahmen. Ungenutzte Anlagen kosten jeden Tag.");
  if (report.bottleneck) tips.push(`Engpass war meist: ${report.bottleneck}. Dort lohnt der nächste Ausbau.`);
  if (report.closedPistes > 0) tips.push(`${report.closedPistes} Piste(n) lagen zeitweise unter der Schneegrenze – Beschneiung oder höher bauen.`);
  if (report.satisfaction < 60) tips.push("Die Gäste waren unzufrieden: lange Wartezeiten oder zu hohe Preise drücken den Ruf.");
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <BigStat label="Gäste" value={fmt(report.guests)} />
        <BigStat label="Netto" value={fmtSigned(report.net)} tone={report.net >= 0 ? "good" : "bad"} />
        <BigStat label="Umsatz" value={fmt(report.revenue)} />
        <BigStat label="Unterhalt" value={`−${fmt(report.upkeep)}`} />
      </div>
      {prev && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
          <Trend label="Gäste" now={report.guests} before={prev.guests} pct={pct(report.guests, prev.guests)} />
          <Trend label="Netto" now={report.net} before={prev.net} pct={pct(report.net, prev.net)} />
          <span className="self-center text-[10px] font-medium text-subtle">ggü. Runde {prev.round}</span>
        </div>
      )}
      {ahead && (
        <div className="mt-2 rounded-[14px] bg-snow px-3 py-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-navy">
              Noch {fmt(ahead.missing)} Gäste bis {MEDAL_LABEL[ahead.medal]}
            </span>
            <MedalBadge medal={ahead.medal} size="sm" />
          </div>
          <div className="mt-1">
            <SeasonGoalBar compact bare />
          </div>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between rounded-[16px] bg-snow px-3 py-2.5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">Zufriedenheit</div>
          <div className={`value text-[18px] font-bold ${report.satisfaction >= 75 ? "text-success" : report.satisfaction >= 55 ? "text-warn" : "text-danger"}`}>
            {report.satisfaction} %
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">Wetter</div>
          <WeatherStrip kinds={report.weather} size="md" />
        </div>
      </div>
      {(records.length > 0 || report.teamwork) && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {report.teamwork && (
            <li className="rounded-[12px] bg-success/12 px-3 py-2 text-[12px] font-semibold text-success">
              Teamwork-Bonus: ihr habt beide gebaut – +{fmt(MATCH.teamwork.coins)} CHF, +{MATCH.teamwork.stars} Stern
            </li>
          )}
          {records.map((r) => (
            <li key={r} className="rounded-[12px] bg-coin/20 px-3 py-2 text-[12px] font-semibold text-navy">
              🏆 {r}
            </li>
          ))}
        </ul>
      )}
      {report.vip && (
        <p
          className={`mt-2 rounded-[12px] px-3 py-2 text-[12px] font-semibold ${
            report.vip.status === "done" ? "bg-coin/20 text-navy" : "bg-danger/10 text-danger"
          }`}
        >
          {report.vip.status === "done"
            ? `👑 ${report.vip.name} ist begeistert – Belohnung kassiert!`
            : `${report.vip.name} ist enttäuscht abgereist – ein Stern weniger.`}
        </p>
      )}
      {report.event && (
        <p className="mt-2 text-[11px] text-muted">
          Ereignis: {report.event}
          {report.compromise ? " – ihr wart uneinig, beides galt zur Hälfte." : ""}
        </p>
      )}
      {report.wallets && <ReportWallets wallets={report.wallets} />}
      {report.research ? <p className="mt-1 text-[11px] text-muted">Forschung: +{fmt(report.research)} FP</p> : null}
      <ReportNextStep onAction={onAction} />
      {tips.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {tips.map((t) => (
            <li key={t} className="rounded-[12px] bg-warn/10 px-3 py-2 text-[12px] leading-snug text-warn">
              {t}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Trend({ label, now, before, pct }: { label: string; now: number; before: number; pct: number | null }) {
  const up = now >= before;
  return (
    <span className={`rounded-full px-2 py-1 ${up ? "bg-success/12 text-success" : "bg-danger/10 text-danger"}`}>
      {label} {up ? "▲" : "▼"} {pct === null ? fmtSigned(now - before) : `${pct > 0 ? "+" : ""}${pct} %`}
    </span>
  );
}

/** The one move the next round should start with, from the same advice as the map chip. */
function ReportNextStep({ onAction }: { onAction?: () => void }) {
  const lifts = useGame((s) => s.lifts);
  const pistes = useGame((s) => s.pistes);
  const buildings = useGame((s) => s.buildings);
  const stats = useGame((s) => s.stats);
  const flow = useGame((s) => s.flow);
  const coins = useGame((s) => s.coins);
  const links = useResortLinks();
  const step = useMemo(
    () => nextStep({ lifts, pistes, buildings, stats, flow, links, coins, unlocked: (id) => itemUnlocked(useGame.getState(), id) }),
    [lifts, pistes, buildings, stats, flow, links, coins],
  );
  if (!step) return null;
  return (
    <div className="mt-3 rounded-[14px] bg-accent-soft/40 p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-accent">Nächste Runde</div>
      <p className="mt-0.5 text-[12px] leading-snug text-navy">{step.text}</p>
      {step.action && (
        <button
          type="button"
          onClick={() => {
            onAction?.();
            runStepAction(step.action!);
          }}
          className="btn-3d mt-2 flex h-11 items-center gap-1 rounded-full bg-accent px-4 text-[12px] font-bold text-panel"
          style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
        >
          {step.actionLabel} <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
}

/** After a round is played: what happened, before the next one starts. */
export function RoundReportModal() {
  const history = useGame((s) => s.match.history);
  const seen = useGame((s) => s.seenReportRound);
  const markSeen = useGame((s) => s.markReportSeen);
  const phase = useGame((s) => s.match.phase);
  if (seen < 0 || history.length <= seen) return null;
  const report = history[history.length - 1]!;
  const finished = phase === "finished";
  return (
    <Modal onClose={() => markSeen(history.length)}>
      <div className="bg-gradient-to-br from-navy to-[#24508f] px-5 pb-5 pt-6 text-snow">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-soft">
          Saison {report.season} · Tag {report.dayFrom}–{report.dayTo}
        </div>
        <div className="mt-1 text-[24px] font-bold">Runde {report.round} gespielt</div>
        {report.medal && (
          <div className="mt-3 flex items-center gap-3 rounded-[16px] bg-panel/12 p-3">
            <MedalBadge medal={report.medal} size="lg" />
            <div>
              <div className="text-[16px] font-bold">Saison {report.season}: {MEDAL_LABEL[report.medal]}!</div>
              <div className="text-[12px] text-ice">Die Saison ist zu Ende. Nach der Sommerpause geht es weiter.</div>
            </div>
          </div>
        )}
      </div>
      <div className="p-4">
        <ReportBody report={report} history={history} onAction={() => markSeen(history.length)} />
        <div className="mt-4">
          <PrimaryButton onClick={() => markSeen(history.length)}>
            {finished ? "Zum Endstand" : "Weiter bauen"} <ChevronRight className="size-4" />
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

/** Choosing a match length. Starting one clears the valley, so it asks. */
export function MatchSetupModal() {
  const open = useGame((s) => s.matchSetupOpen);
  const setOpen = useGame((s) => s.setMatchSetupOpen);
  const start = useGame((s) => s.startMatch);
  const saveGame = useGame((s) => s.saveGame);
  const builtSomething = useGame((s) => s.lifts.length + s.pistes.length + s.buildings.length > 0);
  const mode = useGame((s) => s.match.mode);
  const [preset, setPreset] = useState<"kurz" | "normal" | "lang">("normal");
  const [rules, setRules] = useState<MatchOptions>({ ...DEFAULT_MATCH_OPTIONS });
  const [showRules, setShowRules] = useState(false);
  if (!open) return null;
  return (
    <Modal onClose={() => setOpen(false)} wide>
      <div className="p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Neue Partie</div>
        <div className="mt-1 text-[22px] font-bold text-navy">Wie lange wollt ihr spielen?</div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {MATCH.presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`rounded-[18px] p-3 text-left ring-2 transition-colors ${
                preset === p.id ? "bg-accent-soft/50 ring-accent" : "bg-snow ring-transparent hover:ring-line"
              }`}
            >
              <div className="text-[15px] font-bold text-navy">{p.label}</div>
              <div className="mt-0.5 text-[11px] text-muted">{p.hint}</div>
              <div className="value mt-2 text-[12px] font-semibold text-coin">Start: {fmt(p.startingCoins)} CHF</div>
            </button>
          ))}
        </div>
        <ul className="mt-4 flex flex-col gap-2 text-[12px] leading-snug text-muted">
          <li className="flex gap-2">
            <Users className="mt-0.5 size-4 shrink-0 text-accent" />
            Ihr baut gleichzeitig. Wenn alle Anwesenden «Runde beenden» drücken, rechnet das Spiel zehn Tage durch.
          </li>
          <li className="flex gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-coin" />
            Viele Runden bringen ein Ereignis mit zwei Optionen – Weltcup, Föhnsturm, Lawinengefahr …
          </li>
          <li className="flex gap-2">
            <Trophy className="mt-0.5 size-4 shrink-0 text-star" />
            Pro Saison gibt es Bronze, Silber oder Gold für eure Gäste. Am Ende zählen Kasse, Anlagen, Gäste, Zufriedenheit und Medaillen.
          </li>
        </ul>
        <div className="mt-4 rounded-[18px] bg-snow/60 p-2">
          <button
            type="button"
            onClick={() => setShowRules(!showRules)}
            className="flex min-h-10 w-full items-center justify-between px-1 text-[13px] font-bold text-navy"
          >
            Spielregeln anpassen
            <span className="text-[11px] font-medium text-muted">
              {rules.economy === "shared" ? "Gemeinsame Kasse" : rules.economy === "roles" ? "Berg & Tal" : "Duell"} · Ereignisse{" "}
              {rules.events === "off" ? "aus" : rules.events === "vote" ? "abstimmen" : "wer zuerst"} {showRules ? "−" : "+"}
            </span>
          </button>
          {showRules && (
            <div className="mt-1">
              <RulesEditor value={rules} onChange={(patch) => setRules((r) => ({ ...r, ...patch }))} />
              <p className="mt-2 text-[10px] text-subtle">Ausser der Kasse lässt sich alles auch während der Partie zwischen den Runden ändern.</p>
            </div>
          )}
        </div>
        {builtSomething && (
          <p className="mt-4 rounded-[14px] bg-accent-soft/40 px-3 py-2 text-[12px] font-medium text-navy">
            Das Tal wird für die Partie geleert. {mode === "match" ? "Die laufende Partie" : "Euer freies Spiel"} wird vorher
            automatisch gesichert – unter «Spielstände» jederzeit wieder ladbar.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="sm:w-1/3">
            <PrimaryButton tone="light" onClick={() => setOpen(false)}>
              Abbrechen
            </PrimaryButton>
          </div>
          <PrimaryButton
            tone="success"
            onClick={() => {
              // Saved first: the socket handles messages in order, so the
              // save copies the valley before the match clears it.
              if (builtSomething) saveGame(mode === "match" ? "Partie vor dem Neustart" : "Freies Spiel vor der Partie");
              start(preset, rules);
            }}
          >
            <Flag className="size-4" /> Partie starten
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

/** The end of a match: the score, the medals and the table. */
export function FinalScreen() {
  // Narrow subscriptions: this component is mounted for the whole game, and a
  // whole-store subscription re-rendered it on every hover and every tick.
  const match = useGame((s) => s.match);
  const seen = useGame((s) => s.seenReportRound);
  const hallOfFame = useGame((s) => s.hallOfFame);
  const setMatchSetupOpen = useGame((s) => s.setMatchSetupOpen);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const historyLen = match.history.length;
  // Show once the last report has been read, or when asked for from the bar.
  const asked = seen === -2;
  useEffect(() => {
    if (asked) setDismissedAt(null);
  }, [asked]);
  if (match.mode !== "match" || match.phase !== "finished") return null;
  if (!asked && (seen < historyLen || dismissedAt === match.startedAt)) return null;
  const close = () => {
    setDismissedAt(match.startedAt);
    useGame.setState({ seenReportRound: historyLen });
  };
  // Read once when shown; the finished resort no longer changes.
  const score = scoreBreakdown(useGame.getState());
  const rank = hallOfFame.findIndex((r) => r.score === match.score && r.finishedAt >= match.startedAt) + 1;
  return (
    <Modal onClose={close} wide>
      <div className="relative overflow-hidden bg-gradient-to-br from-navy to-[#24508f] px-5 pb-6 pt-7 text-snow">
        <Confetti />
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-soft">Partie beendet</div>
        <div className="value mt-1 text-[40px] font-bold leading-none">{fmt(score.total)}</div>
        <div className="text-[13px] text-ice">Punkte{rank > 0 ? ` · Platz ${rank} eurer Bestenliste` : ""}</div>
        <div className="mt-4 flex gap-2">
          {match.goals.map((g) => (
            <div key={g.season} className="flex items-center gap-2 rounded-full bg-panel/12 py-1 pl-1 pr-3">
              {g.medal ? <MedalBadge medal={g.medal} size="sm" /> : <span className="grid size-6 place-items-center rounded-full bg-panel/20 text-[10px]">–</span>}
              <span className="text-[11px]">Saison {g.season}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <BigStat label="Kasse" value={`${fmt(score.cash)}`} />
          <BigStat label="Anlagen" value={`${fmt(score.assets)}`} />
          <BigStat label="Gäste" value={`${fmt(score.guests)}`} />
          <BigStat label="Zufriedenheit" value={`${fmt(score.satisfaction)}`} />
          <BigStat label="Medaillen" value={`${fmt(score.medals)}`} />
          {score.secret > 0 && <BigStat label="Geheimziele" value={`${fmt(score.secret)}`} />}
          <BigStat label="Total" value={`${fmt(score.total)}`} tone="good" />
        </div>
        <FinalRules />
        <AlbumView />
        <AwardsPanel />
        {hallOfFame.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Bestenliste</div>
            <ol className="flex flex-col gap-1">
              {hallOfFame.slice(0, 5).map((r, i) => (
                <li key={`${r.finishedAt}-${i}`} className={`flex items-center gap-2 rounded-[12px] px-3 py-2 text-[12px] ${r.finishedAt >= match.startedAt && r.score === match.score ? "bg-accent-soft/40" : "bg-snow"}`}>
                  <span className="value w-5 font-bold text-navy">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-navy">
                    {r.resortName} · {MATCH.presets.find((p) => p.id === r.preset)?.label}
                  </span>
                  <span className="flex gap-0.5">
                    {r.medals.map((m, j) => (
                      <span key={j} className="size-2.5 rounded-full" style={{ background: MEDAL_COLOR[m] }} />
                    ))}
                  </span>
                  <span className="value font-bold text-navy">{fmt(r.score)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <PrimaryButton tone="light" onClick={close}>
            Gebiet ansehen
          </PrimaryButton>
          <PrimaryButton
            tone="success"
            onClick={() => {
              close();
              setMatchSetupOpen(true);
            }}
          >
            Neue Partie <ChevronRight className="size-4" />
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

const CONFETTI_COLORS = ["#F4B942", "#2F6FED", "#34A853", "#E24B4A", "#A8CBF5", "#ffffff"];

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 7) * 0.12,
        duration: 1.6 + ((i * 13) % 10) / 10,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
        rotate: (i * 47) % 360,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className="confetti-bit absolute -top-3 block h-2.5 w-1.5 rounded-[1px]"
          style={{
            left: `${b.left}%`,
            background: b.color,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.duration}s`,
            transform: `rotate(${b.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/** Level-ups and other good news, briefly and in the middle. */
export function Celebration() {
  const celebrate = useGame((s) => s.celebrate);
  const clear = useGame((s) => s.clearCelebration);
  useEffect(() => {
    if (!celebrate) return;
    const t = window.setTimeout(clear, 4200);
    return () => window.clearTimeout(t);
  }, [celebrate, clear]);
  if (!celebrate) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[18%] z-40 flex justify-center px-4">
      <button
        type="button"
        onClick={clear}
        className="pop-in pointer-events-auto relative overflow-hidden rounded-[24px] bg-gradient-to-br from-accent to-navy px-6 py-4 text-center text-snow shadow-[var(--shadow-panel)]"
      >
        <Confetti />
        <div className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-soft">
          <Sparkles className="size-4" /> {celebrate.kicker ?? "Aufgestiegen"}
        </div>
        <div className="mt-0.5 text-[26px] font-bold">{celebrate.title}</div>
        <div className="mt-0.5 max-w-xs text-[12px] text-ice">{celebrate.body}</div>
      </button>
    </div>
  );
}

/** Notifications as toasts that leave by themselves. */
export function Toasts() {
  const notes = useGame((s) => s.notifications);
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const visible = notes.filter((n) => now - n.at < 5500 && !hidden.has(n.id)).slice(0, 3);
  if (visible.length === 0) return null;
  return (
    <div className="pointer-events-none flex w-[min(92vw,22rem)] flex-col gap-1.5">
      {visible.map((n) => (
        <div
          key={n.id}
          className="toast-in pointer-events-auto flex items-start gap-2 rounded-[16px] bg-panel/96 px-3 py-2 shadow-[var(--shadow-panel)] backdrop-blur-md"
        >
          <span
            className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-panel ${
              n.kind === "warn" ? "bg-warn" : n.kind === "ok" ? "bg-success" : "bg-accent"
            }`}
          >
            {n.kind === "warn" ? <span className="text-[11px] font-bold">!</span> : <Check className="size-3" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-navy">{n.title}</div>
            <div className="text-[11px] leading-snug text-muted">{n.body}</div>
          </div>
          <button
            type="button"
            aria-label="Schliessen"
            onClick={() => setHidden((h) => new Set(h).add(n.id))}
            className="grid size-7 shrink-0 place-items-center rounded-full text-subtle"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Season goal and report history, for the goals tab. */
export function MatchGoalsPanel() {
  const match = useGame((s) => s.match);
  const openSetup = useGame((s) => s.setMatchSetupOpen);
  if (match.mode !== "match") {
    return (
      <div className="rounded-[18px] bg-snow p-3">
        <div className="text-[13px] font-bold text-navy">Lust auf eine Partie?</div>
        <p className="mt-1 text-[12px] leading-snug text-muted">
          Runden statt Echtzeit, Ereignisse, Medaillen und eine Endwertung – an einem Abend oder über ein paar Tage.
        </p>
        <button type="button" onClick={() => openSetup(true)} className="mt-2 text-[12px] font-bold text-accent">
          Partie einrichten →
        </button>
      </div>
    );
  }
  const recent = [...match.history].reverse().slice(0, 4);
  return (
    <div className="flex flex-col gap-3">
      <SeasonGoalBar />
      {recent.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Letzte Runden</div>
          <div className="flex flex-col gap-1">
            {recent.map((r) => (
              <div key={r.round} className="flex items-center gap-2 rounded-[12px] bg-snow px-2.5 py-1.5 text-[11px]">
                <span className="value w-9 font-bold text-navy">R{r.round}</span>
                <span className="value min-w-0 flex-1 text-muted">{fmt(r.guests)} Gäste</span>
                <span className={`value font-semibold ${r.net >= 0 ? "text-success" : "text-danger"}`}>{fmtSigned(r.net)}</span>
                {r.medal && <MedalBadge medal={r.medal} size="sm" />}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="text-[11px] text-muted">
        Punkte bisher: <span className="value font-bold text-navy">{fmt(match.score)}</span>
      </div>
      <AlbumView />
    </div>
  );
}

/** End of match: reveal secret goals, VIP tally and, in a duel, the winner. */
function FinalRules() {
  const state = useResortView();
  const me = useGame((s) => s.playerId);
  const secrets = secretGoalResults(state);
  const duel = state.match.options.economy === "duel" ? duelScores(state) : [];
  const vips = state.match.vipHistory;
  if (secrets.length === 0 && duel.length === 0 && vips.length === 0) return null;
  const name = (id: string) => state.contributors[id]?.name ?? "?";
  return (
    <div className="mt-4 flex flex-col gap-3">
      {duel.length > 1 && (
        <div className="rounded-[18px] bg-gradient-to-br from-coin/30 to-panel p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Duell</div>
          <div className="mt-0.5 text-[18px] font-bold text-navy">
            🏆 {name(duel[0]!.playerId)} gewinnt mit {fmt(duel[0]!.total)} zu {fmt(duel[1]!.total)}
          </div>
          <div className="mt-1 text-[11px] text-muted">Kasse, halber Anlagewert, Gäste der eigenen Bahnen und das Geheimziel.</div>
        </div>
      )}
      {secrets.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Geheimziele aufgedeckt</div>
          <div className="flex flex-col gap-1">
            {secrets.map((r) => (
              <div key={r.playerId} className="flex items-center gap-2 rounded-[12px] bg-snow px-3 py-2 text-[12px]">
                <span className="size-2.5 rounded-full" style={{ background: peerColor(r.playerId) }} />
                <span className="min-w-0 flex-1 text-navy">
                  <b>{name(r.playerId)}{r.playerId === me ? " (du)" : ""}</b>: {r.def?.title} – {r.def?.hint}
                </span>
                <span className={`font-bold ${r.met ? "text-success" : "text-subtle"}`}>{r.met ? `✓ +${r.def?.points}` : "✗"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {vips.length > 0 && (
        <div className="text-[12px] text-muted">
          VIP-Gäste: {vips.filter((v) => v.status === "done").length} von {vips.length} glücklich abgereist.
        </div>
      )}
    </div>
  );
}

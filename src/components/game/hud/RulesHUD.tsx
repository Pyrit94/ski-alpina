import { useState, type ReactNode } from "react";
import { ArrowRightLeft, Crown, EyeOff, Mountain, Sparkles, Store, Swords, Users, Wallet } from "lucide-react";
import { SECRET_GOALS, VIPS } from "@ski/config";
import {
  conditionsProgress,
  duelScores,
  type EconomyMode,
  type EventMode,
  type MatchOptions,
} from "@ski/shared";
import { fmt } from "@/lib/game/format";
import { useMyMoney, useResortView } from "@/lib/game/team";
import { peerColor } from "@/lib/game/players";
import { useGame } from "@/lib/game/store";

// ---------------------------------------------------------------------------
// The rules editor: in the match setup, and between rounds
// ---------------------------------------------------------------------------

const ECONOMY: { id: EconomyMode; label: string; hint: string; icon: typeof Users }[] = [
  { id: "shared", label: "Gemeinsame Kasse", hint: "Alles gehört allen.", icon: Users },
  { id: "roles", label: "Berg & Tal", hint: "Eine:r baut Bahnen und Pisten, die andere Person Hotels und Gastro. Jede Rolle hat ihre Kasse.", icon: Mountain },
  { id: "duel", label: "Duell", hint: "Wer verdient mehr? Jede:r hat eigenes Geld und verdient an den eigenen Bahnen.", icon: Swords },
];

const EVENTS: { id: EventMode; label: string }[] = [
  { id: "off", label: "Aus" },
  { id: "first", label: "Wer zuerst" },
  { id: "vote", label: "Abstimmen" },
];

function Toggle({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex min-h-12 w-full items-center gap-3 rounded-[14px] bg-snow px-3 py-2 text-left disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-navy">{label}</span>
        <span className="block text-[11px] leading-snug text-muted">{hint}</span>
      </span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-success" : "bg-line"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-panel shadow transition-all ${on ? "left-[1.1rem]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 rounded-full bg-snow p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`h-9 rounded-full text-[12px] font-semibold ${value === o.id ? "bg-accent text-panel" : "text-navy hover:bg-ice"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * All switchable rules. `lockEconomy` during a match: the purse rule holds
 * for the whole match, the rest applies from the next round on.
 */
export function RulesEditor({
  value,
  onChange,
  lockEconomy = false,
}: {
  value: MatchOptions;
  onChange: (patch: Partial<MatchOptions>) => void;
  lockEconomy?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Kasse</div>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {ECONOMY.map((e) => {
            const Icon = e.icon;
            const active = value.economy === e.id;
            return (
              <button
                key={e.id}
                type="button"
                disabled={lockEconomy && !active}
                onClick={() => onChange({ economy: e.id })}
                className={`rounded-[16px] p-2.5 text-left ring-2 disabled:opacity-40 ${active ? "bg-accent-soft/50 ring-accent" : "bg-snow ring-transparent"}`}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-bold text-navy">
                  <Icon className="size-4 text-accent" /> {e.label}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-muted">{e.hint}</span>
              </button>
            );
          })}
        </div>
        {lockEconomy && <p className="mt-1 text-[10px] text-subtle">Die Kassen-Regel gilt für die ganze Partie.</p>}
      </div>
      {value.economy === "roles" && (
        <div>
          <div className="mb-1 flex justify-between text-[11px] font-semibold text-navy">
            <span>Einnahmen Berg {value.roleSplit} %</span>
            <span>Tal {100 - value.roleSplit} %</span>
          </div>
          <input
            type="range"
            min={10}
            max={90}
            step={5}
            value={value.roleSplit}
            onChange={(e) => onChange({ roleSplit: Number(e.target.value) })}
            className="h-2 w-full accent-[var(--color-accent)]"
            aria-label="Aufteilung der Einnahmen"
          />
        </div>
      )}
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Ereignisse</div>
        <Segmented value={value.events} options={EVENTS} onChange={(events) => onChange({ events })} />
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <Toggle on={value.vips} onChange={(vips) => onChange({ vips })} label="VIP-Gäste" hint="Wünsche mit Frist – Belohnung oder ein Stern weniger" />
        <Toggle on={value.secretGoals} onChange={(secretGoals) => onChange({ secretGoals })} label="Geheime Ziele" hint="Jede:r hat ein verdecktes Ziel für Bonuspunkte" />
        <Toggle on={value.research} onChange={(research) => onChange({ research })} label="Forschung" hint="Forschungspunkte sammeln und Verbesserungen freischalten" />
        <Toggle
          on={value.teamwork}
          onChange={(teamwork) => onChange({ teamwork })}
          label="Teamwork-Bonus"
          hint="Bauen alle in einer Runde etwas: Geld und ein Stern"
          disabled={value.economy === "duel"}
        />
        <Toggle on={value.album} onChange={(album) => onChange({ album })} label="Fotoalbum" hint="Nach jeder Runde ein Bild des Gebiets, am Ende als Zeitraffer" />
      </div>
    </div>
  );
}

/** The rules during a match, changeable for the next rounds. */
export function MatchRulesPanel() {
  const options = useGame((s) => s.match.options);
  const mode = useGame((s) => s.match.mode);
  const phase = useGame((s) => s.match.phase);
  const set = useGame((s) => s.setMatchOptions);
  const [open, setOpen] = useState(false);
  if (mode !== "match" || phase !== "plan") return null;
  return (
    <div className="rounded-[18px] bg-snow/60 p-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex min-h-10 w-full items-center justify-between px-1 text-[12px] font-bold text-navy">
        Regeln für die nächsten Runden
        <span className="text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-1">
          <RulesEditor value={options} onChange={set} lockEconomy />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Purses
// ---------------------------------------------------------------------------

/** In "roles": pick the mountain or the valley. Shown until both have chosen. */
export function RoleChooser() {
  const match = useGame((s) => s.match);
  const me = useGame((s) => s.playerId);
  const players = useGame((s) => s.players);
  const choose = useGame((s) => s.chooseRole);
  if (match.mode !== "match" || match.options.economy !== "roles" || match.phase !== "plan") return null;
  const mine = me ? match.roles[me] : undefined;
  const others = players.filter((p) => p.id !== me);
  const taken = (role: "berg" | "tal") => others.find((p) => match.roles[p.id] === role);
  if (mine) return null;
  const card = (role: "berg" | "tal", title: string, hint: string, Icon: typeof Mountain) => {
    const by = taken(role);
    return (
      <button
        type="button"
        onClick={() => choose(role)}
        className="flex min-h-20 flex-1 flex-col items-start gap-1 rounded-[18px] bg-snow p-3 text-left ring-2 ring-transparent hover:ring-accent"
      >
        <span className="flex items-center gap-1.5 text-[14px] font-bold text-navy">
          <Icon className="size-4 text-accent" /> {title}
        </span>
        <span className="text-[11px] leading-snug text-muted">{hint}</span>
        {by && <span className="text-[10px] font-semibold" style={{ color: peerColor(by.id) }}>schon gewählt von {by.name}</span>}
      </button>
    );
  };
  return (
    <div className="pop-in pointer-events-auto w-[min(100%,28rem)] rounded-[22px] bg-panel p-3 shadow-[var(--shadow-panel)]">
      <div className="mb-2 text-[13px] font-bold text-navy">Wer übernimmt was?</div>
      <div className="flex gap-2">
        {card("berg", "Berg", "Bahnen, Pisten, Beschneiung, Pistenraupen", Mountain)}
        {card("tal", "Tal", "Hotels, Restaurants, Shops, Parkplätze, Dienste", Store)}
      </div>
    </div>
  );
}

/** Purses and handing money over: roles and duel. */
export function WalletPanel() {
  const match = useGame((s) => s.match);
  const me = useGame((s) => s.playerId);
  const contributors = useGame((s) => s.contributors);
  const transfer = useGame((s) => s.transferCoins);
  const money = useMyMoney();
  const [amount, setAmount] = useState(5000);
  if (!money.separate) return null;
  const roles = match.options.economy === "roles";
  const myKey = roles ? (me ? match.roles[me] : undefined) : me;
  const keys = Object.keys(match.wallets);
  const label = (k: string) => (k === "berg" ? "Berg" : k === "tal" ? "Tal" : (contributors[k]?.name ?? "Mitspieler:in"));
  const targets = keys.filter((k) => k !== myKey);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1.5">
        {keys.map((k) => (
          <div key={k} className={`rounded-[14px] px-3 py-2 ${k === myKey ? "bg-accent-soft/50" : "bg-snow"}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {label(k)}
              {k === myKey ? " (du)" : ""}
            </div>
            <div className="value text-[16px] font-bold text-navy">{fmt(match.wallets[k] ?? 0)}</div>
          </div>
        ))}
      </div>
      {roles && <p className="text-[11px] text-muted">Einnahmen: Berg {match.options.roleSplit} %, Tal {100 - match.options.roleSplit} %.</p>}
      {myKey && targets.length > 0 && (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (amount > 0) transfer(targets[0]!, amount);
          }}
        >
          <input
            type="number"
            min={1000}
            step={1000}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            className="h-10 min-w-0 flex-1 rounded-full bg-snow px-3 text-[13px] text-navy outline-none ring-1 ring-line focus:ring-accent"
            aria-label="Betrag"
          />
          <button type="submit" className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-accent px-3 text-[12px] font-bold text-panel">
            <ArrowRightLeft className="size-4" /> an {label(targets[0]!)}
          </button>
        </form>
      )}
    </div>
  );
}

/** For the top bar: my purse, with the total as a hint. */
export function MyPurseChip({ coin }: { coin: ReactNode }) {
  const money = useMyMoney();
  const noPurse = useGame((s) => {
    if (!money.separate) return false;
    const me = s.playerId;
    const key = s.match.options.economy === "roles" ? (me ? s.match.roles[me] : undefined) : me;
    return !key || !(key in s.match.wallets);
  });
  if (noPurse) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-panel/92 py-1 pl-1 pr-2.5 text-[11px] font-semibold text-muted shadow-[var(--shadow-chip)]">
        <span className="grid size-6 place-items-center rounded-full bg-ice">
          <Wallet className="size-3.5 text-subtle" />
        </span>
        Rolle wählen
      </div>
    );
  }
  return (
    <div
      className="flex items-center gap-1.5 rounded-full bg-panel/92 py-1 pl-1 pr-2.5 shadow-[var(--shadow-chip)]"
      title={money.separate ? `Deine Kasse · gesamt ${fmt(money.total)} CHF` : "Kasse in CHF"}
    >
      <span className="grid size-6 place-items-center rounded-full bg-ice shadow-[inset_0_1px_2px_rgba(11,31,58,.12)]">
        {money.separate ? <Wallet className="size-3.5 text-coin" /> : coin}
      </span>
      <span className="value min-w-[1.7rem] text-right text-[13px] font-bold text-navy lg:min-w-[3rem] lg:text-[14px]">
        <span className="lg:hidden">{money.mine >= 10000 ? `${(money.mine / 1000).toFixed(1)}k` : fmt(money.mine)}</span>
        <span className="hidden lg:inline">{fmt(money.mine)}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VIP, secret goal, duel standings
// ---------------------------------------------------------------------------

export function VipCard() {
  const vip = useGame((s) => s.match.vip);
  const round = useGame((s) => s.match.round);
  const state = useResortView();
  if (!vip || vip.status !== "open") return null;
  const def = VIPS.find((v) => v.id === vip.id);
  const progress = def ? conditionsProgress(state, def.all) : 0;
  const left = vip.dueRound - round + 1;
  return (
    <div className="rounded-[18px] bg-gradient-to-br from-[#FFF6DD] to-panel p-3 ring-1 ring-coin/40">
      <div className="flex items-center gap-2">
        <Crown className="size-5 text-coin" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-navy">VIP: {vip.name}</div>
          <div className="text-[11px] text-muted">wünscht sich {vip.wish}</div>
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ice">
        <div className="h-full rounded-full bg-coin" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{left <= 1 ? "Letzte Runde!" : `Noch ${left} Runden`}</span>
        <span>
          +{fmt(vip.rewardCoins)} CHF · +{vip.rewardStars} ★
        </span>
      </div>
    </div>
  );
}

/** My secret goal. The partner's stays hidden until the end. */
export function SecretGoalCard() {
  const secret = useGame((s) => s.match.secret);
  const me = useGame((s) => s.playerId);
  const state = useResortView();
  const id = me ? secret[me] : undefined;
  const def = id ? SECRET_GOALS.find((g) => g.id === id) : undefined;
  if (!def) return null;
  const progress = conditionsProgress(state, def.all);
  return (
    <div className="rounded-[18px] bg-navy p-3 text-snow">
      <div className="flex items-center gap-2">
        <EyeOff className="size-4 text-accent-soft" />
        <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-soft">Dein Geheimziel</div>
      </div>
      <div className="mt-1 text-[14px] font-bold">{def.title}</div>
      <div className="text-[12px] text-ice">
        {def.hint} · {def.points} Punkte
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel/20">
        <div className="h-full rounded-full bg-success" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
}

export function DuelStandings() {
  const state = useResortView();
  if (state.match.mode !== "match" || state.match.options.economy !== "duel") return null;
  const rows = duelScores(state);
  return (
    <div className="rounded-[18px] bg-snow p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <Swords className="size-3.5" /> Duell-Stand
      </div>
      {rows.map((r, i) => (
        <div key={r.playerId} className="flex items-center gap-2 py-1 text-[12px]">
          <span className="value w-4 font-bold text-navy">{i + 1}.</span>
          <span className="size-2.5 rounded-full" style={{ background: peerColor(r.playerId) }} />
          <span className="min-w-0 flex-1 truncate font-semibold text-navy">{state.contributors[r.playerId]?.name ?? "?"}</span>
          <span className="value font-bold text-navy">{fmt(r.total)}</span>
        </div>
      ))}
    </div>
  );
}

/** With voting on: who voted for what. */
export function VoteStatus() {
  const event = useGame((s) => s.match.event);
  const mode = useGame((s) => s.match.options.events);
  const players = useGame((s) => s.players);
  if (!event || mode !== "vote" || event.chosen !== null) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-2 text-[11px]">
      {players.map((p) => {
        const v = event.votes?.[p.id];
        return (
          <span key={p.id} className="flex items-center gap-1 rounded-full bg-snow px-2 py-1">
            <span className="size-2 rounded-full" style={{ background: peerColor(p.id) }} />
            {p.name}: <b>{v === undefined ? "…" : event.options[v]?.label}</b>
          </span>
        );
      })}
      <span className="flex items-center gap-1 text-subtle">
        <Sparkles className="size-3" /> Uneinig? Dann gilt beides zur Hälfte.
      </span>
    </div>
  );
}

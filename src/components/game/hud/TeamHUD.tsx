import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Award, Eye, Hammer, MessageCircle, Send, TriangleAlert, X } from "lucide-react";
import { tallyPlayers, useUnreadChat, type PlayerTally } from "@/lib/game/team";
import { fmt } from "@/lib/game/format";
import { peerColor } from "@/lib/game/players";
import { useGame } from "@/lib/game/store";

/** One-tap messages for when typing is too slow. */
const QUICK_LINES = ["👍", "Super!", "Bin bereit 🏁", "Hier bauen?", "Geld sparen 💰", "Mehr Pisten!", "Gleich zurück ⏳"];

function timeLabel(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const hm = d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === today.toDateString() ? hm : `${d.toLocaleDateString("de-CH", { day: "numeric", month: "numeric" })} ${hm}`;
}

/** Team chat with quick reactions. Messages stay with the resort. */
export function ChatPanel({ compact = false }: { compact?: boolean }) {
  const chat = useGame((s) => s.chat);
  const me = useGame((s) => s.playerId);
  const send = useGame((s) => s.sendChat);
  const markRead = useGame((s) => s.markChatRead);
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    markRead();
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, markRead]);

  const submit = (line: string) => {
    if (!line.trim()) return;
    send(line);
    setText("");
  };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div ref={list} className={`flex flex-col gap-1.5 overflow-y-auto pr-1 ${compact ? "max-h-[40dvh]" : "max-h-64"}`}>
        {chat.length === 0 && (
          <p className="rounded-[12px] bg-snow px-3 py-2 text-[12px] text-muted">
            Noch nichts geschrieben. Nachrichten bleiben im Gebiet – auch wenn die andere Person gerade nicht da ist.
          </p>
        )}
        {chat.map((c) => {
          const mine = c.actor === me;
          return (
            <div key={c.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] rounded-[14px] px-3 py-1.5 text-[13px] leading-snug ${mine ? "bg-accent text-panel" : "bg-snow text-navy"}`}
              >
                {!mine && (
                  <span className="mb-0.5 block text-[10px] font-bold" style={{ color: peerColor(c.actor) }}>
                    {c.actorName}
                  </span>
                )}
                {c.text}
              </div>
              <span className="mt-0.5 text-[9px] text-subtle">{timeLabel(c.at)}</span>
            </div>
          );
        })}
      </div>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
        {QUICK_LINES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => submit(q)}
            className="h-8 shrink-0 rounded-full bg-ice px-3 text-[12px] font-semibold text-navy hover:bg-accent-soft/60"
          >
            {q}
          </button>
        ))}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <input
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nachricht …"
          className="h-10 min-w-0 flex-1 rounded-full bg-snow px-3 text-[13px] text-navy outline-none ring-1 ring-line focus:ring-accent"
        />
        <button
          type="submit"
          aria-label="Senden"
          disabled={!text.trim()}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-panel disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}

export function UnreadBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold leading-4 text-panel ring-2 ring-panel">
      {n > 9 ? "9+" : n}
    </span>
  );
}

const MARKS: { kind: "look" | "build" | "warn"; label: string; icon: typeof Eye }[] = [
  { kind: "look", label: "Schau mal", icon: Eye },
  { kind: "build", label: "Hier bauen?", icon: Hammer },
  { kind: "warn", label: "Problem", icon: TriangleAlert },
];

/**
 * Leave a marker on the map for the other player: pick what it means, then
 * tap the spot. It shows for both, bobbing, for about 45 seconds.
 */
export function MarkButtons({ vertical = false }: { vertical?: boolean }) {
  const mode = useGame((s) => s.markMode);
  const setMode = useGame((s) => s.setMarkMode);
  return (
    <div className={`flex ${vertical ? "flex-col" : ""} items-center gap-1 rounded-full bg-panel/92 p-1 shadow-[var(--shadow-chip)]`}>
      {MARKS.map((m) => {
        const Icon = m.icon;
        const active = mode === m.kind;
        return (
          <button
            key={m.kind}
            type="button"
            title={`${m.label}: dann auf die Karte tippen`}
            aria-label={m.label}
            onClick={() => setMode(active ? null : m.kind)}
            className={`grid size-9 place-items-center rounded-full ${active ? "bg-coin text-navy" : "text-navy hover:bg-snow"}`}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

/** While a marker is being placed: say so, and offer a way out. */
export function MarkHint() {
  const mode = useGame((s) => s.markMode);
  const setMode = useGame((s) => s.setMarkMode);
  if (!mode) return null;
  const label = MARKS.find((m) => m.kind === mode)?.label ?? "";
  return (
    <div className="pop-in pointer-events-auto flex items-center gap-2 rounded-full bg-coin px-3 py-1.5 text-[12px] font-bold text-navy shadow-[var(--shadow-chip)]">
      «{label}» – tippe auf die Stelle
      <button type="button" aria-label="Abbrechen" onClick={() => setMode(null)} className="grid size-6 place-items-center rounded-full bg-navy/10">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** A floating chat button with the unread count, for the desktop map. */
export function ChatFab({ onOpen }: { onOpen: () => void }) {
  const unread = useUnreadChat();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Team-Chat"
      className="relative grid size-11 place-items-center rounded-full bg-panel/92 text-navy shadow-[var(--shadow-chip)]"
    >
      <MessageCircle className="size-5" />
      <UnreadBadge n={unread} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Awards at the end of a match
// ---------------------------------------------------------------------------

interface AwardDef {
  title: string;
  pick: (r: PlayerTally) => number;
  detail: (r: PlayerTally) => string;
}

const AWARDS: AwardDef[] = [
  { title: "Bahnbau-Profi", pick: (r) => r.lifts, detail: (r) => `${r.lifts} Bahn${r.lifts === 1 ? "" : "en"}` },
  { title: "Pistenkönig:in", pick: (r) => r.pisteKm, detail: (r) => `${r.pisteKm.toFixed(1)} km Piste` },
  { title: "Gastgeber:in", pick: (r) => r.hosting, detail: (r) => `${r.hosting} Hotels, Beizen, Shops` },
  { title: "Entscheider:in", pick: (r) => r.decisions, detail: (r) => `${r.decisions} Ereignisse entschieden` },
  { title: "Grosse Pläne", pick: (r) => r.spent, detail: (r) => `${fmt(r.spent)} CHF verbaut` },
];

/** Who did what: one title per category, for the end screen. */
export function AwardsPanel() {
  const contributors = useGame((s) => s.contributors);
  const lifts = useGame((s) => s.lifts);
  const pistes = useGame((s) => s.pistes);
  const buildings = useGame((s) => s.buildings);
  const match = useGame((s) => s.match);
  const rows = useMemo(
    () => tallyPlayers({ contributors, lifts, pistes, buildings, match }),
    [contributors, lifts, pistes, buildings, match],
  );
  if (rows.length === 0) return null;
  const awards: { title: string; who: PlayerTally; detail: string }[] = [];
  for (const a of AWARDS) {
    const best = [...rows].sort((x, y) => a.pick(y) - a.pick(x))[0];
    if (best && a.pick(best) > 0) awards.push({ title: a.title, who: best, detail: a.detail(best) });
  }
  if (awards.length === 0) return null;
  const teamRounds = match.history.filter((r) => r.teamwork).length;
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Auszeichnungen</div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {awards.map((a) => (
          <AwardRow key={a.title} color={peerColor(a.who.id)} title={a.title} who={a.who.name} detail={a.detail} />
        ))}
        {teamRounds > 0 && (
          <AwardRow color="#34A853" title="Dream-Team" who="Ihr beide" detail={`${teamRounds} von ${match.history.length} Runden zusammen gebaut`} />
        )}
      </div>
    </div>
  );
}

function AwardRow({ color, title, who, detail }: { color: string; title: string; who: ReactNode; detail: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[14px] bg-snow px-3 py-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-full text-panel" style={{ background: color }}>
        <Award className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[12px] font-bold text-navy">
          {title}: <span style={{ color }}>{who}</span>
        </div>
        <div className="text-[11px] text-muted">{detail}</div>
      </div>
    </div>
  );
}

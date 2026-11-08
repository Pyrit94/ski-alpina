import { CableCar, Handshake, Mountain, Users, X } from "lucide-react";
import { FLOW, NEIGHBOURS } from "@ski/config";
import {
  absDay,
  liveCounter,
  neighbourCutOf,
  neighbourEstimate,
  neighboursOn,
  offerAt,
  pactFee,
  type Neighbour,
  type NeighbourMode,
} from "@ski/shared";
import { showNeighbour } from "@/lib/game/neighbours";
import { fmt, fmtCompact } from "@/lib/game/format";
import { useGame } from "@/lib/game/store";
import { useMyMoney } from "@/lib/game/team";
import { useStableGame } from "../canvas/use-stable-game";

const km = (n: Neighbour) => n.pistes.reduce((sum, p) => sum + Math.max(1, p.hexes.length - 1) * FLOW.kmPerSegment, 0);
const pct = (v: number) => `${Math.round(v * 100)} %`;
const OFFER_LABELS = ["−20 %", "Schätzwert", "+10 %"];

/**
 * A neighbour ski area's card: who they are, how big, how busy, what they
 * take from you — and what you can do about it: a «Tarifverbund», or buying
 * them out. Opens on a tap on their lifts, stations or name.
 */
export function NeighbourCard() {
  const open = useGame((s) => s.neighbourOpen);
  const list = useStableGame((s) => neighboursOn(s));
  const mode = useGame((s) => s.neighbours?.mode ?? "off");
  const cut = useGame((s) => s.stats.neighbourCut ?? 0);
  const today = useGame((s) => absDay(s));
  const n = list.find((x) => x.id === open);
  if (!n) return null;
  const close = () => useGame.setState({ neighbourOpen: null });
  const share = neighbourCutOf({ neighbours: { mode, list } }, cut, n);
  return (
    <div className="toast-in pointer-events-auto w-[min(94vw,360px)] rounded-[20px] bg-panel/95 p-3 shadow-[var(--shadow-panel)] backdrop-blur-md">
      <div className="flex items-start gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ice text-muted">
          <Mountain className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-navy">{n.name}</div>
          <div className="text-[11px] text-muted">
            {n.pact ? "Partner im Tarifverbund" : mode === "wettbewerb" ? "Konkurrenz im Tal" : "Nachbar-Skigebiet"}
          </div>
        </div>
        <button type="button" onClick={close} aria-label="Schliessen" className="grid size-11 shrink-0 place-items-center rounded-full bg-ice text-muted">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <Figure label="Bahnen" value={String(n.lifts.length)} />
        <Figure label="Pisten" value={`${km(n).toFixed(1)} km`} />
        <Figure label="Gäste/Tag" value={n.guestsYesterday > 0 ? fmtCompact(n.guestsYesterday) : "neu"} />
      </div>
      <p className="mt-2 rounded-[12px] bg-ice px-2.5 py-1.5 text-[11px] leading-snug text-navy">
        {n.pact ? (
          <>Ein Pass für beide Gebiete: Sie nehmen euch keine Gäste, ihre Pisten locken zusätzliche an.</>
        ) : (
          <>
            Es fehlen euch gerade <span className="font-bold">{pct(share)}</span> der Gäste.{" "}
            {mode === "wettbewerb"
              ? `Ihr Pass kostet ${NEIGHBOURS.wettbewerb.rivalTicket} CHF – je teurer eurer, desto mehr gehen zu ihnen.`
              : "Je grösser euer Gebiet, desto mehr bleiben bei euch."}
          </>
        )}
      </p>
      <PactRow n={n} />
      <BuyRow n={n} today={today} />
    </div>
  );
}

function PactRow({ n }: { n: Neighbour }) {
  const sendIntent = useGame((s) => s.sendIntent);
  const money = useMyMoney().mine;
  const fee = pactFee(n);
  const blocked = !n.pact && money < fee;
  return (
    <div className="mt-2 flex items-center gap-2 rounded-[12px] bg-snow px-2.5 py-1 ring-1 ring-line">
      <Handshake className={`size-4 shrink-0 ${n.pact ? "text-success" : "text-muted"}`} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-navy">Tarifverbund</div>
        <div className="value text-[11px] text-muted">{fmt(fee)} CHF pro Tag</div>
      </div>
      <button
        type="button"
        disabled={blocked}
        onClick={() => sendIntent({ type: "neighbour_pact", neighbourId: n.id, on: !n.pact })}
        className={`min-h-11 shrink-0 rounded-full px-3.5 text-[12px] font-semibold disabled:opacity-50 ${n.pact ? "bg-ice text-navy" : "bg-accent text-panel"}`}
      >
        {n.pact ? "Kündigen" : "Abschliessen"}
      </button>
    </div>
  );
}

function BuyRow({ n, today }: { n: Neighbour; today: number }) {
  const sendIntent = useGame((s) => s.sendIntent);
  const sendPlan = useGame((s) => s.sendPlan);
  const money = useMyMoney().mine;
  const estimate = neighbourEstimate(n);
  const season = useGame((s) => s.season);
  const day = useGame((s) => s.day);
  const counter = liveCounter({ season, day }, n);
  const title = `${n.name} kaufen`;
  return (
    <div className="mt-2 rounded-[12px] bg-snow px-2.5 py-2 ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-navy">Kaufen</span>
        <span className="text-[11px] text-muted">
          Schätzwert <span className="value font-semibold text-navy">{fmt(estimate)} CHF</span>
        </span>
      </div>
      {counter ? (
        <>
          <p className="mt-1 text-[11px] leading-snug text-navy">
            Gegenangebot: <span className="value font-bold">{fmt(counter.price)} CHF</span>
            <span className="text-muted">
              {" "}
              · {counter.until - today + 1 === 1 ? "nur noch heute" : `noch ${counter.until - today + 1} Tage`}
            </span>
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => sendIntent({ type: "answer_counter", neighbourId: n.id, accept: false })}
              className="min-h-11 rounded-full bg-ice text-[12px] font-semibold text-navy"
            >
              Ablehnen
            </button>
            <button
              type="button"
              disabled={money < counter.price}
              onClick={() => sendPlan([{ type: "answer_counter", neighbourId: n.id, accept: true }], title)}
              className="min-h-11 rounded-full bg-success text-[12px] font-semibold text-panel disabled:opacity-50"
            >
              Annehmen
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {NEIGHBOURS.buyout.quickOffers.map((share, i) => {
              const amount = offerAt(n, share);
              return (
                <button
                  key={share}
                  type="button"
                  disabled={money < amount}
                  onClick={() => sendPlan([{ type: "offer_buyout", neighbourId: n.id, amount }], title)}
                  className={`flex min-h-11 flex-col items-center justify-center rounded-[12px] px-1 leading-tight disabled:opacity-50 ${share === 1 ? "bg-accent text-panel" : "bg-ice text-navy"}`}
                >
                  <span className="text-[10px] font-semibold">{OFFER_LABELS[i] ?? pct(share)}</span>
                  <span className="value text-[12px] font-bold">{fmtCompact(amount)}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] leading-snug text-muted">
            Unter ihrem Preis kommt ein Gegenangebot. Läuft es schlecht für sie, verkaufen sie günstiger.
          </p>
        </>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-ice px-1.5 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="value text-[13px] font-bold text-navy">{value}</div>
    </div>
  );
}

/** «Nachbarn» in Betrieb: every neighbour area, one tap to fly there. */
export function NeighboursPanel() {
  const list = useStableGame((s) => neighboursOn(s));
  const mode = useGame((s) => s.neighbours?.mode ?? "off");
  const cut = useGame((s) => s.stats.neighbourCut ?? 0);
  if (list.length === 0) return null;
  return (
    <section className="rounded-[18px] bg-snow p-2.5 ring-1 ring-line">
      <div className="flex items-center justify-between px-1">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-navy">
          <Users className="size-4 text-muted" /> {mode === "wettbewerb" ? "Konkurrenz" : "Nachbarn"}
        </h3>
        <span className="text-[11px] text-muted">
          nehmen euch <span className="value font-semibold text-navy">{pct(cut)}</span> der Gäste
        </span>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1">
        {list.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => showNeighbour(n)}
              className="flex min-h-11 w-full items-center gap-2 rounded-[12px] bg-panel px-2.5 text-left text-[12px] text-navy"
            >
              {n.pact ? <Handshake className="size-4 shrink-0 text-success" /> : <CableCar className="size-4 shrink-0 text-muted" />}
              <span className="min-w-0 flex-1 truncate font-semibold">{n.name}</span>
              <span className="shrink-0 text-[11px] text-muted">
                {n.lifts.length} {n.lifts.length === 1 ? "Bahn" : "Bahnen"} · {km(n).toFixed(1)} km
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 px-1 text-[10px] leading-snug text-muted">
        {mode === "wettbewerb"
          ? `Bis ${pct(NEIGHBOURS.wettbewerb.maxCut)} und mehr, wenn euer Pass teurer ist als ihrer. Tarifverbund oder Kauf schaffen Ruhe.`
          : `Höchstens ${pct(NEIGHBOURS.maxCut)}, und weniger, je grösser euer eigenes Gebiet ist. Im Tarifverbund nehmen sie nichts.`}
      </p>
    </section>
  );
}

const SETTING_TEXT: Record<NeighbourMode, string> = {
  off: "Ihr seid allein im Tal.",
  gemuetlich: "Andere Skigebiete in der Gegend wachsen langsam und teilen sich die Gäste mit euch. Euer Gebiet lassen sie in Ruhe.",
  wettbewerb: "Stärkere Rivalen: Sie wachsen schneller, nehmen mehr Gäste und locken mit günstigeren Pässen. Euer Gebiet lassen auch sie in Ruhe.",
};

/** The setting: neighbours off, «Gemütlich» or «Wettbewerb». */
export function NeighbourSetting() {
  const mode = useGame((s) => s.neighbours?.mode ?? "off");
  // Locked for a whole match, the finished one too, until free play resumes.
  const matchRunning = useGame((s) => s.match.mode === "match");
  const sendIntent = useGame((s) => s.sendIntent);
  const options = [
    { v: "off" as const, label: "Aus" },
    { v: "gemuetlich" as const, label: "Gemütlich" },
    { v: "wettbewerb" as const, label: "Wettbewerb" },
  ];
  return (
    <>
      <div className="grid grid-cols-3 gap-1 p-1.5">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            disabled={matchRunning}
            onClick={() => mode !== o.v && sendIntent({ type: "set_neighbours", mode: o.v })}
            className={`min-h-11 rounded-full text-[13px] font-semibold disabled:opacity-50 ${mode === o.v ? "bg-accent text-panel" : "text-navy"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="px-3 pb-2.5 text-[11px] leading-snug text-muted">{SETTING_TEXT[mode]}</p>
    </>
  );
}

import { Check, ChevronRight, Coins, Eye, Hand, Users, X } from "lucide-react";
import { hexToWorld, type Intent } from "@ski/shared";
import { awayLabel } from "@/lib/game/away";
import { fmt, fmtSigned } from "@/lib/game/format";
import { useGame } from "@/lib/game/store";
import { Modal, PrimaryButton } from "./MatchHUD";
import { HelperButton, HelperCard, HelperFooter } from "./HelperCard";

/** Where on the map a proposal does its work, for «Zeigen». */
function placeOf(intents: readonly Intent[]): { x: number; z: number } | null {
  const first = intents[0];
  if (!first) return null;
  const hex =
    first.type === "place_building" || first.type === "move_building"
      ? { q: first.q, r: first.r }
      : first.type === "place_lift"
        ? first.a
        : first.type === "place_piste"
          ? first.hexes[Math.floor(first.hexes.length / 2)]
          : first.type === "rearrange"
            ? first.moves[0]
            : null;
  if (hex) return hexToWorld(hex.q, hex.r);
  if (first.type === "expand" || first.type === "upgrade") {
    const s = useGame.getState();
    const b = s.buildings.find((x) => x.id === first.entityId);
    if (b) return hexToWorld(b.q, b.r);
    const l = s.lifts.find((x) => x.id === first.entityId);
    if (l) return hexToWorld(l.a.q, l.a.r);
  }
  return null;
}

/**
 * Open proposals: the other player's, to accept or decline, and one's own,
 * waiting, to withdraw. One card at a time; the rest are counted.
 */
export function ProposalCard() {
  const proposals = useGame((s) => s.proposals ?? []);
  const me = useGame((s) => s.playerId);
  const phase = useGame((s) => s.phase);
  const helperOpen = useGame((s) => s.helper !== null);
  const sendIntent = useGame((s) => s.sendIntent);
  // A helper card has the floor for now; the proposal waits beneath it.
  if (proposals.length === 0 || phase !== "idle" || helperOpen) return null;
  // Theirs first: those need an answer.
  const sorted = [...proposals].sort((a, b) => Number(a.by === me) - Number(b.by === me) || a.at - b.at);
  const p = sorted[0]!;
  const mine = p.by === me;
  const decide = (accept: boolean) => sendIntent({ type: "decide_proposal", proposalId: p.id, accept });
  const where = placeOf(p.intents);
  return (
    <HelperCard
      icon={mine ? Hand : Users}
      title={p.title}
      subtitle={
        <>
          {mine ? "Dein Vorschlag wartet" : `${p.byName} schlägt vor`}
          {sorted.length > 1 ? ` · ${sorted.length - 1} weitere` : ""}
          {p.cost > 0 && (
            <span className="font-semibold text-coin">
              {" · "}
              <Coins className="inline size-3.5 align-[-2px]" /> {fmt(p.cost)}
            </span>
          )}
        </>
      }
      aside={
        where ? (
          <button
            type="button"
            onClick={() => useGame.getState().focusOn(where.x, where.z)}
            aria-label="Auf der Karte zeigen"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-ice text-navy"
          >
            <Eye className="size-4" />
          </button>
        ) : undefined
      }
      footer={
        <HelperFooter>
          {mine ? (
            <HelperButton variant="secondary" grow onClick={() => decide(false)}>
              Zurückziehen
            </HelperButton>
          ) : (
            <>
              <HelperButton variant="secondary" onClick={() => decide(false)}>
                <X className="size-4" /> Ablehnen
              </HelperButton>
              <HelperButton variant="success" grow onClick={() => decide(true)}>
                <Check className="size-4" /> Annehmen
              </HelperButton>
            </>
          )}
        </HelperFooter>
      }
    />
  );
}

/** «Während du weg warst»: once after coming back, then gone. */
export function AwayModal() {
  const away = useGame((s) => s.awaySummary);
  const name = useGame((s) => s.playerName);
  if (!away) return null;
  const close = () => useGame.setState({ awaySummary: null });
  return (
    <Modal onClose={close}>
      <div className="bg-gradient-to-br from-navy to-[#24508f] px-5 pb-5 pt-6 text-snow">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-soft">Während du weg warst · {awayLabel(away.minutes)}</div>
        <div className="mt-1 text-[22px] font-bold">Willkommen zurück, {name}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Figure label="Geld" value={fmtSigned(away.coins)} />
          <Figure label="Gäste" value={`+${fmt(away.visitors)}`} />
          <Figure label="Tage" value={`+${away.days}`} />
        </div>
      </div>
      <div className="p-4">
        {away.proposals.length > 0 && (
          <p className="mb-3 rounded-[14px] bg-accent/10 px-3 py-2 text-[12px] font-semibold text-navy">
            {away.proposals.length === 1
              ? `${away.proposals[0]!.byName} wartet auf dein Ja: ${away.proposals[0]!.title}.`
              : `${away.proposals.length} Vorschläge warten auf dich.`}
          </p>
        )}
        {away.news.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {away.news.map((n) => (
              <li key={n.id} className="rounded-[12px] bg-ice px-3 py-2 text-[12px] text-navy">
                <span className="font-bold">{n.actorName}:</span> {n.title}
                {n.body ? <span className="text-muted"> · {n.body}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-muted">Gebaut hat in der Zwischenzeit niemand. Das Gebiet lief weiter.</p>
        )}
        <div className="mt-4">
          <PrimaryButton onClick={close}>
            {away.proposals.length > 0 ? "Zu den Vorschlägen" : "Weiter bauen"} <ChevronRight className="size-4" />
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-panel/12 px-2 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ice">{label}</div>
      <div className="value text-[16px] font-bold">{value}</div>
    </div>
  );
}


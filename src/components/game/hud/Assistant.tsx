import { ChevronRight, MapPin, Mountain, Sparkles, Spline, Wand2, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { useAssistFacts } from "@/lib/game/assist";
import { helperRows, usefulCount, type HelperRow } from "@/lib/game/helper-status";
import { isBreakage } from "@/lib/game/next-step";
import { useGame } from "@/lib/game/store";
import { useDiscoverHint } from "@/lib/game/use-discover";
import { useNextStep } from "@/lib/game/use-next-step";
import { AutoPistesPanel } from "./AutoPistes";
import { HelperCard, HintChip } from "./HelperCard";
import { RoundButton } from "./HudBits";
import { MidStationPanel } from "./MidStation";
import { VillagePanel } from "./Needs";
import { NeighbourCard } from "./Neighbours";
import { NextStepChip } from "./NextStepChip";
import { ReshapePanel } from "./Reshape";

const ROW_ICON: Record<HelperRow["id"], LucideIcon> = {
  auto: Sparkles,
  village: Wand2,
  reshape: Spline,
  neighbour: Mountain,
  midstation: MapPin,
};

/** The round «Assistent» button; a dot when a helper has something useful to offer. */
export function AssistantButton() {
  const open = useGame((s) => s.helper?.id === "hub");
  const toggleHelper = useGame((s) => s.toggleHelper);
  const facts = useAssistFacts();
  const useful = useMemo(() => usefulCount(helperRows(facts)), [facts]);
  return (
    <RoundButton
      label="Assistent"
      active={open}
      onClick={() => toggleHelper({ id: "hub" })}
      badge={useful > 0 && !open ? <span className="absolute right-0.5 top-0.5 size-3 rounded-full bg-success ring-2 ring-panel" aria-label={`${useful} Vorschläge`} /> : null}
    >
      <Sparkles className="size-6" />
    </RoundButton>
  );
}

/**
 * The «Assistent»: every helper on one card, each with a line about the
 * resort as it stands and sorted by how much it would help now. A tap opens
 * that helper's card in its place.
 */
export function AssistantHub() {
  const open = useGame((s) => s.helper?.id === "hub");
  const openHelper = useGame((s) => s.openHelper);
  const facts = useAssistFacts();
  const rows = useMemo(() => helperRows(facts), [facts]);
  if (!open) return null;
  const close = () => openHelper(null);
  return (
    <HelperCard icon={Sparkles} title="Assistent" subtitle="Was euch gerade weiterhilft" onClose={close}>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => {
          const Icon = ROW_ICON[r.id];
          const hot = r.open !== null && r.score >= 50;
          return (
            <li key={r.id}>
              <button
                type="button"
                disabled={!r.open}
                onClick={() => {
                  if (!r.open) return;
                  openHelper(r.open);
                }}
                className="flex min-h-14 w-full items-center gap-2.5 rounded-[14px] bg-ice px-2.5 text-left disabled:opacity-55"
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-full ${hot ? "bg-accent text-panel" : "bg-panel text-accent"}`}>
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-navy">{r.title}</span>
                  <span className={`block truncate text-[11px] ${hot ? "font-semibold text-accent" : "text-muted"}`}>{r.status}</span>
                </span>
                {r.open && <ChevronRight className="size-4 shrink-0 text-muted" />}
              </button>
            </li>
          );
        })}
      </ul>
    </HelperCard>
  );
}

/**
 * Where the open helper card goes: one at a time, the same place on a phone
 * and on a desktop. Put aside while building; it comes back after.
 */
export function HelperSlot() {
  const id = useGame((s) => s.helper?.id ?? null);
  const phase = useGame((s) => s.phase);
  if (!id || phase !== "idle") return null;
  if (id === "hub") return <AssistantHub />;
  if (id === "auto") return <AutoPistesPanel />;
  if (id === "village") return <VillagePanel />;
  if (id === "reshape") return <ReshapePanel />;
  if (id === "neighbour") return <NeighbourCard />;
  return <MidStationPanel />;
}

/**
 * The advisor's one voice: something broken to fix first (isBreakage), then
 * a feature worth discovering, then the next good move. Quiet while a card, a
 * selection, building or the partner's proposal has the player's attention.
 */
export function AdvisorSlot() {
  const phase = useGame((s) => s.phase);
  const selectedId = useGame((s) => s.selectedId);
  const helperOpen = useGame((s) => s.helper !== null);
  const theirProposal = useGame((s) => (s.proposals ?? []).some((p) => p.by !== s.playerId));
  const { step, dismiss } = useNextStep();
  const facts = useAssistFacts();
  const urgent = isBreakage(step);
  const discover = useDiscoverHint(facts, urgent);
  if (phase !== "idle" || selectedId || helperOpen || theirProposal) return null;
  if (step && urgent) return <NextStepChip step={step} onDismiss={dismiss} />;
  if (discover.hint) {
    return (
      <HintChip
        icon={Sparkles}
        kicker="Neu"
        text={discover.hint.text}
        action={{ label: "Zeigen", onClick: discover.act }}
        onDismiss={discover.dismiss}
        dismissLabel="Hinweis ausblenden"
      />
    );
  }
  return step ? <NextStepChip step={step} onDismiss={dismiss} /> : null;
}

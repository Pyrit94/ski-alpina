import { NeighboursPanel } from "./Neighbours";
import { BarChart3, MessageCircle, ListChecks, X, FlaskConical, Settings } from "lucide-react";
import { ChatPanel, MarkButtons, UnreadBadge } from "./TeamHUD";
import { ResearchPanel } from "./ResearchHUD";
import { DuelStandings, MatchRulesPanel, SecretGoalCard, VipCard, WalletPanel } from "./RulesHUD";
import { useResearchReady } from "@/lib/game/research-ready";
import { useUnreadChat } from "@/lib/game/team";
import { MatchGoalsPanel } from "./MatchHUD";
import { useGame } from "@/lib/game/store";
import type { HudSheet } from "@/lib/game/types";
import { toggleSheet } from "./hud-shared";
import { PlayersLine, RoundButton } from "./HudBits";
import { ActivityPanel, InfoPanel, OperationsPanel, TicketPricePanel, RenamePanel, Quests } from "./InfoPanels";
import { MobileMenuBody } from "./MenuBody";
import { BigBuildButton } from "./BuildDrawer";
import { LongGoalsPanel, RankPanel } from "./Progression";

/**
 * Betrieb, Ziele, Forschung, Team: round buttons down the right edge. Each
 * opens its panel — a sheet on a phone, a card beside the rail on a desktop.
 */
export function ActionRail() {
  const sheet = useGame((s) => s.sheet);
  const phase = useGame((s) => s.phase);
  const unread = useUnreadChat();
  const researchReady = useResearchReady();
  if (phase !== "idle" || sheet === "build") return null;
  const open = (next: HudSheet) => toggleSheet(sheet, next);
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col gap-2.5 lg:top-1/2 lg:-translate-y-1/2">
      <RoundButton label="Betrieb" active={sheet === "info"} onClick={() => open("info")}>
        <BarChart3 className="size-6" />
      </RoundButton>
      <RoundButton label="Ziele" active={sheet === "quests"} onClick={() => open("quests")}>
        <ListChecks className="size-6" />
      </RoundButton>
      <RoundButton
        label="Forschung"
        active={sheet === "research"}
        onClick={() => open("research")}
        badge={researchReady && sheet !== "research" ? <span className="absolute right-0.5 top-0.5 size-3 rounded-full bg-success ring-2 ring-panel" aria-label="Forschung bereit" /> : null}
      >
        <FlaskConical className="size-6" />
      </RoundButton>
      <RoundButton label="Team" active={sheet === "chat"} onClick={() => open("chat")} badge={<UnreadBadge n={unread} />}>
        <MessageCircle className="size-6" />
      </RoundButton>
    </div>
  );
}

/** Desktop: menu bottom left, Bauen bottom right. */
export function DesktopCorners() {
  const sheet = useGame((s) => s.sheet);
  const phase = useGame((s) => s.phase);
  if (phase !== "idle" || sheet === "build") return null;
  return (
    <>
      <div className="absolute bottom-4 left-4 z-20">
        <RoundButton label="Menü" active={sheet === "menu"} onClick={() => toggleSheet(sheet, "menu")}>
          <Settings className="size-6" />
        </RoundButton>
      </div>
      <div className="absolute bottom-4 right-4 z-20">
        <BigBuildButton />
      </div>
    </>
  );
}

/** Pings for the other player: tap one, then the spot on the map. */
export function TeamMarks() {
  const setSheet = useGame((s) => s.setSheet);
  return (
    <div className="rounded-[16px] bg-ice/70 p-2.5">
      <div className="mb-1.5 text-[11px] font-semibold text-navy">Etwas auf der Karte zeigen</div>
      <div onClickCapture={() => setTimeout(() => setSheet("none"), 0)}>
        <MarkButtons />
      </div>
    </div>
  );
}

/**
 * Desktop: the panel the rail opens, as a card left of the rail. A selected
 * building, lift or run shows here too, with its details and upgrades.
 */
export function DesktopPanel() {
  const sheet = useGame((s) => s.sheet);
  const selectedId = useGame((s) => s.selectedId);
  const phase = useGame((s) => s.phase);
  const setSheet = useGame((s) => s.setSheet);
  const selectEntity = useGame((s) => s.selectEntity);
  const showSelected = !!selectedId && phase === "idle" && (sheet === "none" || sheet === "info");
  if (!showSelected && (sheet === "none" || sheet === "build")) return null;
  const kind = showSelected ? "selected" : sheet;
  const title =
    kind === "selected"
      ? "Details"
      : kind === "info"
        ? "Betrieb"
        : kind === "quests"
          ? "Ziele & Partie"
          : kind === "research"
            ? "Forschung"
            : kind === "chat"
              ? "Team"
              : "Menü";
  const close = () => {
    if (kind === "selected") selectEntity(null);
    else setSheet("none");
  };
  const side = kind === "menu" ? "left-24" : "right-24";
  return (
    <div className={`pointer-events-auto absolute bottom-4 top-2 z-20 flex w-[340px] flex-col ${side}`}>
      <div className="flex max-h-full min-h-0 flex-col rounded-[24px] bg-panel/97 shadow-[var(--shadow-panel)] backdrop-blur-md">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <div className="text-[15px] font-semibold text-navy">{title}</div>
          <button type="button" aria-label="Schliessen" onClick={close} className="grid size-10 place-items-center rounded-full text-muted hover:bg-ice">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {kind === "selected" && <InfoPanel />}
          {kind === "info" && (
            <div className="flex flex-col gap-2">
              <OperationsPanel />
              <RankPanel />
              <TicketPricePanel />
              <NeighboursPanel />
              <WalletPanel />
              <RenamePanel />
              <ActivityPanel />
            </div>
          )}
          {kind === "quests" && (
            <div className="flex flex-col gap-2">
              <MatchGoalsPanel />
              <VipCard />
              <SecretGoalCard />
              <DuelStandings />
              <MatchRulesPanel />
              <Quests />
              <LongGoalsPanel />
            </div>
          )}
          {kind === "research" && <ResearchPanel />}
          {kind === "chat" && (
            <div className="flex flex-col gap-2">
              <PlayersLine />
              <TeamMarks />
              <ChatPanel />
            </div>
          )}
          {kind === "menu" && <MobileMenuBody />}
        </div>
      </div>
    </div>
  );
}

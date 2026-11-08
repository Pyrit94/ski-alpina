import { Lightbulb, Wrench } from "lucide-react";
import type { NextStep } from "@/lib/game/next-step";
import { runStepAction } from "@/lib/game/step-actions";
import { HintChip } from "./HelperCard";

/**
 * The single most useful next move, as a chip with its button. Where it
 * shows, and when it gives way, is up to the advisor slot (Assistant.tsx).
 */
export function NextStepChip({ step, onDismiss }: { step: NextStep; onDismiss: () => void }) {
  return (
    <HintChip
      icon={step.tone === "fix" ? Wrench : Lightbulb}
      tone={step.tone === "fix" ? "warn" : "accent"}
      text={step.text}
      action={step.action ? { label: step.actionLabel ?? "Los", onClick: () => runStepAction(step.action!) } : undefined}
      onDismiss={onDismiss}
      dismissLabel="Tipp ausblenden"
    />
  );
}

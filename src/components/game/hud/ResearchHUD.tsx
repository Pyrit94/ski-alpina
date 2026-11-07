/**
 * The research tree, including the alliance branch.
 *
 * Placeholder: the tree lands with the research engine
 * (packages/shared/src/engine/research.ts, packages/config/src/research.ts).
 */
export function ResearchPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`rounded-[18px] bg-snow p-3 text-[12px] text-muted ${compact ? "" : ""}`}>
      Forschung wird gerade gebaut.
    </div>
  );
}

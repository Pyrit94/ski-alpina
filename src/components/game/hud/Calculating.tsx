/** A planner's first answer is still being worked out (in the planner worker). */
export function Calculating({ className = "mt-2" }: { className?: string }) {
  return (
    <p className={`flex items-center gap-2 rounded-[12px] bg-ice px-3 py-2 text-[12px] text-navy ${className}`} role="status">
      <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
      Rechne…
    </p>
  );
}

/** A newer answer is on its way; the one shown may still change. */
export function BusyNote({ className = "ml-auto" }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted ${className}`} role="status">
      <span className="size-2.5 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
      Rechne…
    </span>
  );
}

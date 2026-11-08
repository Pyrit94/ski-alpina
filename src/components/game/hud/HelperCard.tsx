import type { ReactNode } from "react";
import { ArrowRight, X, type LucideIcon } from "lucide-react";
import { BusyNote } from "./Calculating";

/**
 * The one look every helper shares — «Pisten automatisch», «Dorf ordnen»,
 * «Pisten optimieren», a neighbour, the mid-station, proposals, the
 * «Assistent» itself: a header with icon, title, one line and the close
 * button; a body that scrolls on its own; a footer for the price and the
 * buttons that act. Same width everywhere, so cards never jump in size.
 */
export function HelperCard({
  icon: Icon,
  title,
  subtitle,
  onClose,
  busy = false,
  aside,
  footer,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  /** Absent: the card has no close button (a proposal waits for an answer). */
  onClose?: () => void;
  /** A newer answer is being worked out: «Rechne…» next to the title. */
  busy?: boolean;
  /** One more round button in the header, before the close button. */
  aside?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="toast-in pointer-events-auto flex max-h-[min(66dvh,36rem)] w-full max-w-[380px] flex-col overflow-hidden rounded-[20px] bg-panel/96 shadow-[var(--shadow-panel)] backdrop-blur-md lg:max-h-[calc(100dvh-15rem)]"
    >
      <header className="flex items-center gap-2.5 py-2 pl-3 pr-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ice text-accent">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate text-[14px] font-bold leading-tight text-navy">{title}</h2>
            {busy && <BusyNote />}
          </div>
          {subtitle ? <p className="truncate text-[11px] leading-snug text-muted">{subtitle}</p> : null}
        </div>
        {aside}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Schliessen" className="grid size-11 shrink-0 place-items-center rounded-full bg-ice text-muted">
            <X className="size-4" />
          </button>
        )}
      </header>
      {/* Rows keep their height and the body scrolls; a row that scrolls sideways would otherwise collapse. */}
      {children ? <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 pb-3 *:shrink-0">{children}</div> : null}
      {footer ? <footer className="flex flex-col gap-1 border-t border-line/70 bg-snow/70 px-3 py-2">{footer}</footer> : null}
    </section>
  );
}

/** The footer's buttons in a row, and an optional quiet line under them. */
export function HelperFooter({ summary, children }: { summary?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="flex gap-1.5">{children}</div>
      {summary ? <p className="text-center text-[10px] leading-snug text-muted">{summary}</p> : null}
    </>
  );
}

const BUTTON: Record<"primary" | "secondary" | "success", { cls: string; lip?: string }> = {
  primary: { cls: "btn-3d bg-accent text-panel", lip: "var(--color-accent-dark)" },
  secondary: { cls: "btn-3d btn-3d-light bg-ice text-navy" },
  success: { cls: "btn-3d bg-success text-panel", lip: "#23803f" },
};

/** A helper's button: primary does the thing, secondary backs out. 44 px high. */
export function HelperButton({
  variant = "primary",
  grow = false,
  disabled = false,
  onClick,
  label,
  children,
}: {
  variant?: "primary" | "secondary" | "success";
  grow?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
  children: ReactNode;
}) {
  const b = BUTTON[variant];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={`${b.cls} flex h-11 min-w-0 items-center justify-center gap-1 rounded-full px-4 text-[12px] font-bold disabled:opacity-50 ${grow ? "flex-1" : "shrink-0"}`}
      style={b.lip ? { ["--lip" as string]: b.lip } : undefined}
    >
      {children}
    </button>
  );
}

/** A sentence in the body: on ice for a state, amber for a warning, bare for the fine print. */
export function HelperNote({ tone = "info", children }: { tone?: "info" | "warn" | "muted"; children: ReactNode }) {
  const cls =
    tone === "warn"
      ? "rounded-[12px] bg-warn/10 px-3 py-2 text-[11px] text-navy"
      : tone === "muted"
        ? "px-0.5 text-[11px] text-muted"
        : "rounded-[12px] bg-ice px-3 py-2 text-[12px] text-navy";
  return <p className={`leading-snug ${cls}`}>{children}</p>;
}

/** A small figure with its label, for before/after and key numbers. */
export function HelperFigure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-[12px] bg-ice px-2 py-1.5 text-center">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="value text-[12px] font-semibold text-navy">{children}</div>
    </div>
  );
}

/** A quiet link to another helper, inside a card. */
export function HelperLink({ icon: Icon, onClick, children }: { icon: LucideIcon; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-ice text-[12px] font-semibold text-navy">
      <Icon className="size-4 text-accent" /> {children}
    </button>
  );
}

/**
 * The advisor's chip and the discovery hint: an icon, one or two lines, the
 * button that acts, and the cross that puts it away. Same width as the cards.
 */
export function HintChip({
  icon: Icon,
  tone = "accent",
  kicker,
  text,
  action,
  onDismiss,
  dismissLabel = "Ausblenden",
}: {
  icon: LucideIcon;
  tone?: "accent" | "warn";
  kicker?: string;
  text: string;
  action?: { label: string; onClick: () => void };
  onDismiss: () => void;
  dismissLabel?: string;
}) {
  const stacked = !!action && action.label.length > 10;
  return (
    <div
      role="status"
      className={`toast-in pointer-events-auto flex w-full max-w-[380px] gap-2 rounded-[18px] bg-panel/96 p-1.5 pl-2 shadow-[var(--shadow-panel)] backdrop-blur-md ${stacked ? "items-start" : "items-center"}`}
    >
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${stacked ? "mt-1" : ""} ${tone === "warn" ? "bg-warn/15 text-warn" : "bg-ice text-accent"}`}>
        <Icon className="size-[18px]" />
      </span>
      {/* A short button stays in the row; a long one goes under the text, so it cannot squeeze it. */}
      <div className={`flex min-w-0 flex-1 ${stacked ? "flex-col items-start gap-1.5 py-1" : "items-center gap-2"}`}>
        <p className="min-w-0 flex-1 text-[12px] leading-snug text-navy">
          {kicker ? <span className="font-bold text-accent">{kicker} · </span> : null}
          {text}
        </p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="btn-3d flex h-11 max-w-full shrink-0 items-center gap-1 rounded-full bg-accent px-3.5 text-[12px] font-bold text-panel"
            style={{ ["--lip" as string]: "var(--color-accent-dark)" }}
          >
            <span className="truncate">{action.label}</span> <ArrowRight className="size-3.5 shrink-0" />
          </button>
        )}
      </div>
      <button type="button" onClick={onDismiss} aria-label={dismissLabel} className="grid size-11 shrink-0 place-items-center rounded-full text-muted">
        <X className="size-4" />
      </button>
    </div>
  );
}

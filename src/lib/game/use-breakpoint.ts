import { useSyncExternalStore } from "react";

/** The `lg:` breakpoint, so the layout and the mount decision cannot drift. */
const DESKTOP = "(min-width: 1024px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(DESKTOP);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const isDesktopNow = () =>
  typeof window !== "undefined" && window.matchMedia(DESKTOP).matches;

/**
 * Whether the wide layout applies.
 *
 * `hidden lg:flex` only stops a panel being painted — React still mounts it,
 * subscribes every one of its store selectors and re-renders the lot on every
 * tick. On a phone that is the most wasted work in the app, on the weakest
 * device, for pixels nobody sees. This lets the wide columns not exist at all
 * below the breakpoint.
 *
 * The server snapshot is `false` on purpose: mobile-first means the narrow
 * layout is the one that renders without asking, and a desktop browser
 * corrects itself on hydration.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, isDesktopNow, () => false);
}

/**
 * A short buzz in the hand for what matters: a build landing, a refusal, a
 * celebration. Only where the phone can (Android; iOS Safari has no
 * vibration API) and only while switched on; remembered per device.
 */
const KEY = "ski-alpina-haptics";

export type Buzz = "build" | "error" | "celebrate";

/** Milliseconds on, off, on … — short enough to feel like a click, not an alarm. */
export const BUZZ_PATTERN: Record<Buzz, readonly number[]> = {
  build: [14],
  error: [26, 60, 26],
  celebrate: [18, 70, 18, 70, 46],
};

export function hapticsSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}

export function buzz(kind: Buzz): void {
  if (!hapticsSupported() || !hapticsEnabled()) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  try {
    navigator.vibrate([...BUZZ_PATTERN[kind]]);
  } catch {
    /* refused without a user gesture: nothing to do */
  }
}

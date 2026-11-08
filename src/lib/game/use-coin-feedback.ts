import { useEffect, useRef, useState } from "react";
import { useGame } from "./store";
import { play } from "./sound";
import { COUNT_MS, FLOAT_MS, coinFeedback, tweenAt, type CoinFeedback } from "./juice";

export interface CoinPulse {
  id: number;
  kind: Exclude<CoinFeedback, "quiet">;
  delta: number;
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * The purse as it should be shown: counting toward a balance an action
 * changed, with a pulse to animate and the amount to float under it; the
 * income ticking in every second just replaces the number.
 */
export function useCoinFeedback(balance: number): { shown: number; pulse: CoinPulse | null } {
  const seq = useGame((s) => s.coinActionSeq);
  const [shown, setShown] = useState(balance);
  const [pulse, setPulse] = useState<CoinPulse | null>(null);
  const last = useRef({ balance, seq });
  const raf = useRef(0);

  useEffect(() => {
    const prev = last.current;
    last.current = { balance, seq };
    const delta = balance - prev.balance;
    const kind = coinFeedback(delta, seq !== prev.seq);
    cancelAnimationFrame(raf.current);
    if (kind === "quiet" || reducedMotion()) {
      setShown(balance);
      if (kind !== "quiet") setPulse({ id: Date.now(), kind, delta });
      return;
    }
    if (kind === "gain") play("coin");
    setPulse({ id: Date.now(), kind, delta });
    const from = prev.balance;
    const t0 = performance.now();
    const step = () => {
      const t = (performance.now() - t0) / COUNT_MS;
      setShown(Math.round(tweenAt(from, balance, t)));
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [balance, seq]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // The float leaves by itself.
  useEffect(() => {
    if (!pulse) return;
    const t = window.setTimeout(() => setPulse(null), FLOAT_MS);
    return () => window.clearTimeout(t);
  }, [pulse]);

  return { shown, pulse };
}

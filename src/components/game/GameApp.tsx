import { useEffect, useState, type ComponentType } from "react";
import { fetchAlpineWeather } from "@/lib/game/weather";
import { useGame } from "@/lib/game/store";
import { StartScreen } from "./StartScreen";

/**
 * The 3D scene (three.js, ~1 MB) and the in-game HUD are not needed on the
 * start screen. They load once the browser is idle there, so the first
 * screen is quick, and are usually ready by the time a game is picked.
 */
const loadScene = () => import("./canvas/SkiScene").then((m) => m.SkiScene as ComponentType);
const loadHud = () => import("./hud/GameHUD").then((m) => m.GameHUD as ComponentType);

export function GameApp() {
  const started = useGame((s) => s.started);
  const applyWeather = useGame((s) => s.applyWeather);
  const persist = useGame((s) => s.persist);
  const region = useGame((s) => s.region);
  const regionReady = useGame((s) => s.regionReady);
  const [Scene, setScene] = useState<ComponentType | null>(null);
  const [Hud, setHud] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (Scene && Hud) return;
    const load = () => {
      void loadScene().then((c) => setScene(() => c));
      void loadHud().then((c) => setHud(() => c));
    };
    // In a game: now. On the start screen: when the browser has a moment.
    if (started || typeof window.requestIdleCallback !== "function") {
      if (started) load();
      else {
        const t = window.setTimeout(load, 1500);
        return () => window.clearTimeout(t);
      }
      return;
    }
    const id = window.requestIdleCallback(load, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }, [started, Scene, Hud]);

  useEffect(() => {
    void fetchAlpineWeather().then((w) => {
      if (w) applyWeather(w);
    });
  }, [applyWeather]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") persist();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", persist);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", persist);
    };
  }, [persist]);

  if (!started) return <StartScreen />;
  // The map's ground must be in memory before anything measures slopes on it.
  const ready = Scene && Hud && regionReady !== null && regionReady === region;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-navy">
      <div className="absolute inset-0">
        {ready ? <Scene /> : <div className="grid h-full place-items-center text-sm text-ice">Gelände wird geladen…</div>}
      </div>
      {ready && <Hud />}
    </div>
  );
}

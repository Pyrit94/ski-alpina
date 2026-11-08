import { useEffect, useState, type ComponentType } from "react";
import { fetchAlpineWeather } from "@/lib/game/weather";
import { useGame } from "@/lib/game/store";
import { GameHUD } from "./hud/GameHUD";
import { StartScreen } from "./StartScreen";

export function GameApp() {
  const started = useGame((s) => s.started);
  const applyWeather = useGame((s) => s.applyWeather);
  const persist = useGame((s) => s.persist);
  const region = useGame((s) => s.region);
  const regionReady = useGame((s) => s.regionReady);
  const [Scene, setScene] = useState<ComponentType | null>(null);

  useEffect(() => {
    void import("./canvas/SkiScene").then((m) => setScene(() => m.SkiScene));
  }, []);

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
  const ready = Scene && regionReady !== null && regionReady === region;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-navy">
      <div className="absolute inset-0">
        {ready ? <Scene /> : <div className="grid h-full place-items-center text-sm text-ice">Gelände wird geladen…</div>}
      </div>
      {ready && <GameHUD />}
    </div>
  );
}

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { hasSave } from "@/lib/game/save";
import { useGame } from "@/lib/game/store";

const FEATURES = ["Echte Gipfel", "3D-Gelände", "Live-Wetter"];

export function StartScreen() {
  const start = useGame((s) => s.startGame);
  const [resume, setResume] = useState(false);
  useEffect(() => {
    setResume(hasSave());
  }, []);
  return (
    <main className="relative isolate min-h-dvh w-full overflow-hidden bg-navy" style={{ color: "#F5FAFE" }}>
      <img
        src="/textures/hero.jpg"
        alt=""
        className="absolute inset-0 -z-10 h-full w-full object-cover object-[58%_42%] lg:object-center"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-navy via-navy/75 to-navy/20" />
      <div
        className="flex min-h-dvh flex-col justify-between"
        style={{
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
          paddingRight: "max(1.25rem, env(safe-area-inset-right))",
        }}
      >
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 32 32" className="size-10 shrink-0" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#0B1F3A" />
            <path d="M4 22 L12 10 L18 18 L22 12 L28 22 Z" fill="#E8F3FB" />
            <path d="M12 10 L18 18 L8 22 Z" fill="#1A73E8" />
          </svg>
          <div>
            <div className="text-base font-bold tracking-wide lg:text-lg">SKI ALPINA</div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ice">Wallis · Zermatt</div>
          </div>
        </div>

        <div className="w-full max-w-xl">
          <h1 className="text-[clamp(1.85rem,8vw,3.15rem)] font-semibold leading-[1.12] tracking-tight text-snow drop-shadow">
            Baue dein Traum-Skigebiet
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ice lg:mt-4">
            Matterhorn, Klein Matterhorn, Gornergrat — als 3D-Gelände. Lifte, Pisten, Hotellerie und Quests.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {FEATURES.map((f) => (
              <span
                key={f}
                className="rounded-full bg-snow/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ice ring-1 ring-snow/15"
              >
                {f}
              </span>
            ))}
          </div>
          <div className="mt-7 flex w-full flex-col gap-3 sm:max-w-md sm:flex-row">
            {resume && (
              <button
                type="button"
                onClick={() => start(false)}
                className="flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-panel sm:w-auto"
              >
                Fortsetzen <ChevronRight className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => start(true)}
              className={`flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold sm:w-auto ${resume ? "bg-panel/15 text-snow ring-1 ring-snow/30" : "bg-accent text-panel"}`}
            >
              Neues Skigebiet
            </button>
          </div>
          <p className="mt-4 text-[11px] leading-snug text-ice/80">
            Topografie aus realen Gipfelkoordinaten. Wetter live von Open-Meteo.
          </p>
        </div>
      </div>
    </main>
  );
}

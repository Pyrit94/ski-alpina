import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { TERRAIN } from "@ski/config";
import { loadName } from "@/lib/game/net";
import { useGame } from "@/lib/game/store";

const FEATURES = ["Copernicus DEM", "Echtzeit-Koop", "Fluss-Simulation"];

export function StartScreen() {
  const start = useGame((s) => s.startGame);
  const [name, setName] = useState(() => (typeof window === "undefined" ? "Gast" : loadName()));
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
            <rect width="32" height="32" rx="8" fill="#16305C" />
            <path d="M4 22 L12 10 L18 18 L22 12 L28 22 Z" fill="#A8CBF5" />
            <path d="M12 10 L18 18 L8 22 Z" fill="#2F6FED" />
          </svg>
          <div>
            <div className="text-base font-bold tracking-wide lg:text-lg">SKI BUILDER</div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ice">Wallis · Zermatt</div>
          </div>
        </div>

        <div className="w-full max-w-xl">
          <h1 className="text-[clamp(1.85rem,8vw,3.15rem)] font-semibold leading-[1.12] tracking-tight text-snow drop-shadow">
            Gemeinsam ein Skigebiet bauen
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ice lg:mt-4">
            Autoritative Simulation, flussbasierte Wirtschaft, echtes Alpengelaende. Lifte, Pisten, Hotellerie, Quests.
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
          <label className="mt-6 block text-[11px] font-semibold uppercase tracking-wide text-ice">
            Dein Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              className="mt-1.5 flex h-12 min-h-12 w-full max-w-md items-center rounded-full bg-panel/15 px-4 text-[15px] text-snow outline-none ring-1 ring-snow/25"
              placeholder="Name"
            />
          </label>
          <div className="mt-4 flex w-full flex-col gap-3 sm:max-w-md sm:flex-row">
            <button
              type="button"
              onClick={() => start(false, name, "zermatt")}
              className="flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-panel sm:w-auto"
            >
              Gemeinsam bauen <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => start(true, name)}
              className="flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-full bg-panel/15 px-6 text-[15px] font-semibold text-snow ring-1 ring-snow/30 sm:w-auto"
            >
              Eigenes Gebiet
            </button>
          </div>
          <p className="mt-4 text-[11px] leading-snug text-ice/80">{TERRAIN.attribution}</p>
        </div>
      </div>
    </main>
  );
}

import { MapPin } from "lucide-react";
import { ALPS_MAP, REGIONS, type RegionDef } from "@ski/config";

/** Where on the overview map a place sits, in percent. */
function mapPos(lat: number, lon: number) {
  return {
    left: ((lon - ALPS_MAP.west) / (ALPS_MAP.east - ALPS_MAP.west)) * 100,
    top: ((ALPS_MAP.north - lat) / (ALPS_MAP.north - ALPS_MAP.south)) * 100,
  };
}

/**
 * Choose the ski area to build in: real places on a relief map of the Alps,
 * plus the same list as buttons (big enough to tap, and readable without
 * the map). The chosen one shows its own ground and what it is like.
 */
export function RegionPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const chosen: RegionDef = REGIONS.find((r) => r.id === value) ?? REGIONS[0]!;
  return (
    <div>
      <div className="relative overflow-hidden rounded-[16px] ring-1 ring-snow/20">
        <img src="/regions/alpen.png" alt="Reliefkarte der Alpen" className="block h-auto w-full" />
        {REGIONS.map((r) => {
          const p = mapPos(r.village.lat, r.village.lon);
          const on = r.id === chosen.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onChange(r.id)}
              aria-label={`${r.name} wählen`}
              aria-pressed={on}
              className="absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center"
              style={{ left: `${p.left}%`, top: `${p.top}%` }}
            >
              <span
                className={`block rounded-full ring-2 ring-panel transition-all ${on ? "size-4 bg-accent shadow-[0_0_0_4px_rgba(47,111,237,0.35)]" : "size-2.5 bg-navy"}`}
              />
            </button>
          );
        })}
        {(() => {
          const p = mapPos(chosen.village.lat, chosen.village.lon);
          return (
            <span
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-full bg-panel/95 px-2 py-0.5 text-[11px] font-bold text-navy shadow"
              style={{ left: `${Math.min(88, Math.max(12, p.left))}%`, top: `calc(${p.top}% - 30px)` }}
            >
              {chosen.name}
            </span>
          );
        })()}
      </div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Skigebiet">
        {REGIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={r.id === chosen.id}
            onClick={() => onChange(r.id)}
            className={`h-11 shrink-0 rounded-full px-3 text-[12px] font-semibold ${r.id === chosen.id ? "bg-accent text-panel" : "bg-panel/15 text-snow ring-1 ring-snow/25"}`}
          >
            {r.name}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-3 rounded-[16px] bg-navy/40 p-2.5">
        <img
          src={`/regions/${chosen.id}.png`}
          alt={`Relief von ${chosen.name}`}
          className="size-20 shrink-0 rounded-[12px] object-cover ring-1 ring-snow/20"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[14px] font-semibold text-snow">
            <MapPin className="size-3.5" /> {chosen.name}
            <span className="text-[11px] font-medium text-ice">· {chosen.area}</span>
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-ice">{chosen.blurb}</p>
          <p className="mt-1 text-[10px] text-ice/70">Echtes Gelände, 18 × 18 km rund um {chosen.village.name}.</p>
        </div>
      </div>
    </div>
  );
}

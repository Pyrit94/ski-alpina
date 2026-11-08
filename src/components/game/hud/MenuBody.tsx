import type { ReactNode } from "react";
import { useState } from "react";
import { Flag, ChevronRight, RotateCw, Trash2 } from "lucide-react";
import { TERRAIN } from "@ski/config";
import { exportSave } from "@/lib/game/save";
import { play, setSoundEnabled, soundEnabled } from "@/lib/game/sound";
import { SavesPanel } from "./SavesPanel";
import { useGame } from "@/lib/game/store";
import { LayerTabs } from "./HudBits";

/**
 * The phone menu: sections like a settings screen, one row per thing, every
 * row a full-width 48 px target. Saving sits on top, one tap; the list of
 * save points folds away until asked for.
 */
export function MobileMenuBody() {
  const quality = useGame((s) => s.quality);
  const setQuality = (high: boolean) => useGame.setState({ quality: high ? "high" : "low" });
  const photo = useGame((s) => s.photoTextures);
  const setPhoto = useGame((s) => s.setPhotoTextures);
  const [sound, setSound] = useState(() => (typeof window === "undefined" ? true : soundEnabled()));
  return (
    <div className="flex flex-col gap-4 pb-2">
      <SavesPanel compact />
      <MenuSection title="Partie">
        <MobileMatchRows />
      </MenuSection>
      <SpeedSection />
      <MenuSection title="Karte">
        <div className="p-1.5">
          <LayerTabs />
        </div>
      </MenuSection>
      <MenuSection title="Einstellungen">
        <SwitchRow
          label="Ton"
          on={sound}
          onChange={(v) => {
            setSoundEnabled(v);
            setSound(v);
            if (v) play("click");
          }}
        />
        <SwitchRow label="Fotostrukturen" hint="Echte Felsen- und Schneetexturen" on={photo} onChange={setPhoto} />
        <SwitchRow label="Grafik hoch" hint="Aus spart Akku" on={quality === "high"} onChange={setQuality} />
      </MenuSection>
      <MenuSection title="Daten">
        <MenuRow label="Spielstand exportieren" hint="Als Datei auf dieses Gerät" onClick={() => exportSave(useGame.getState())} />
      </MenuSection>
      <p className="px-1 text-[10px] leading-snug text-subtle">{TERRAIN.attribution}</p>
    </div>
  );
}

/** Free play only: pause, normal, fast. A match runs by rounds instead. */
function SpeedSection() {
  const mode = useGame((s) => s.match.mode);
  const speed = useGame((s) => s.speed ?? 1);
  const setSpeed = useGame((s) => s.setSpeed);
  if (mode === "match") return null;
  const options: { v: 0 | 1 | 3; label: string }[] = [
    { v: 0, label: "Pause" },
    { v: 1, label: "Normal" },
    { v: 3, label: "Schnell 3×" },
  ];
  return (
    <MenuSection title="Spieltempo">
      <div className="grid grid-cols-3 gap-1 p-1.5">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setSpeed(o.v)}
            className={`min-h-11 rounded-full text-[13px] font-semibold ${speed === o.v ? "bg-accent text-panel" : "text-navy"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </MenuSection>
  );
}

/** A titled group of rows, like a settings screen. */
function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="divide-y divide-line overflow-hidden rounded-[18px] bg-snow ring-1 ring-line">{children}</div>
    </section>
  );
}

/** One tappable row: label, optional hint, chevron. */
function MenuRow({
  label,
  hint,
  onClick,
  tone = "plain",
  icon,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  tone?: "plain" | "accent" | "danger";
  icon?: ReactNode;
}) {
  const color = tone === "accent" ? "text-accent" : tone === "danger" ? "text-danger" : "text-navy";
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left active:bg-ice">
      {icon && <span className={`grid size-8 shrink-0 place-items-center rounded-full bg-ice ${color}`}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] font-semibold ${color}`}>{label}</span>
        {hint && <span className="block text-[11px] leading-snug text-muted">{hint}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-subtle" />
    </button>
  );
}

/** An on/off row with a real switch, the whole row tappable. */
function SwitchRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left active:bg-ice"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-navy">{label}</span>
        {hint && <span className="block text-[11px] leading-snug text-muted">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}>
        <span className={`absolute top-0.5 size-6 rounded-full bg-panel shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

/** Start, leave or restart a match, as menu rows. */
function MobileMatchRows() {
  const mode = useGame((s) => s.match.mode);
  const openSetup = useGame((s) => s.setMatchSetupOpen);
  const start = useGame((s) => s.startMatch);
  const freePlay = useGame((s) => s.freePlay);
  const setSheet = useGame((s) => s.setSheet);
  const [armed, setArmed] = useState(false);
  return (
    <>
      <MenuRow
        icon={<Flag className="size-4" />}
        tone="accent"
        label={mode === "match" ? "Neue Partie" : "Partie starten"}
        hint="Runden mit Saisonzielen und Medaillen"
        onClick={() => {
          setSheet("none");
          openSetup(true);
        }}
      />
      {mode === "match" && (
        <MenuRow
          icon={<RotateCw className="size-4" />}
          label="Ohne Runden weiterspielen"
          hint="Dieses Tal bleibt, die Zeit läuft von selbst"
          onClick={() => {
            setSheet("none");
            freePlay();
          }}
        />
      )}
      {mode === "match" &&
        (armed ? (
          <div className="flex gap-1.5 p-2">
            <button type="button" onClick={() => setArmed(false)} className="h-11 flex-1 rounded-full bg-ice text-[12px] font-bold text-navy">
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => {
                setSheet("none");
                start("sandbox");
              }}
              className="h-11 flex-1 rounded-full bg-danger text-[12px] font-bold text-panel"
            >
              Alles abreissen
            </button>
          </div>
        ) : (
          <MenuRow
            icon={<Trash2 className="size-4" />}
            tone="danger"
            label="Freies Spiel in leerem Tal"
            hint="Reisst alles ab, vorher fragen wir nochmals"
            onClick={() => setArmed(true)}
          />
        ))}
    </>
  );
}

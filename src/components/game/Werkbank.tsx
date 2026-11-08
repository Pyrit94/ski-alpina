import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CATALOG } from "@ski/config";
import { fitModel, PART_FIT } from "@/lib/game/model-library";
import type { ItemId } from "@/lib/game/types";
import { BuildingModel } from "./canvas/models";
import { makeHexGeometry } from "./canvas/geometry";

const PART_LABEL: Record<string, string> = {
  station: "Liftstation (alle Bahnen)",
  pylon: "Liftmast",
  "carrier-chair": "Sessel",
  "carrier-cabin": "Gondelkabine",
  "carrier-tbar": "Schleppbügel",
};

/**
 * «Modell-Werkbank»: try a model before it goes into the game. Drop a .glb,
 * pick what it replaces, turn and size it next to the built-in model on a
 * hex, then copy the line for public/models/manifest.json.
 */
export function Werkbank() {
  const [file, setFile] = useState<{ name: string; scene: THREE.Object3D } | null>(null);
  const [key, setKey] = useState<string>("restaurant");
  const [level, setLevel] = useState(1);
  const [footprint, setFootprint] = useState(2.1);
  const [yaw, setYaw] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const part = PART_FIT[key];
  const fitKind = part?.fit ?? "width";

  const fitted = useMemo(
    () => (file ? fitModel(file.scene.clone(true), footprint, yaw, fitKind) : null),
    [file, footprint, yaw, fitKind],
  );
  const hex = useMemo(() => makeHexGeometry(1.2), []);
  const fileName = file?.name ?? `${key}${level > 1 ? `-${level}` : ""}.glb`;
  const entry =
    level > 1
      ? { [key]: { file: `${key}.glb`, levels: { [String(level)]: fileName } } }
      : { [key]: { file: fileName, ...(Math.abs(footprint - (part?.size ?? 2.1)) > 0.01 ? { footprint: Number(footprint.toFixed(2)) } : {}), ...(yaw ? { yaw } : {}) } };
  const snippet = JSON.stringify(entry, null, 2);

  const load = async (f: File) => {
    setError(null);
    try {
      const gltf = await new GLTFLoader().parseAsync(await f.arrayBuffer(), "");
      setFile({ name: f.name, scene: gltf.scene });
      const stem = f.name.replace(/\.(glb|gltf)$/i, "");
      const m = /^(.+?)-([2-4])$/.exec(stem);
      const guess = PART_LABEL[stem] ? stem : (m?.[1] ?? stem);
      if (PART_LABEL[guess] || CATALOG.some((i) => i.id === guess)) {
        setKey(guess);
        setFootprint(PART_FIT[guess]?.size ?? 2.1);
      }
      if (m && !PART_LABEL[stem]) setLevel(Number(m[2]));
    } catch {
      setError("Diese Datei liess sich nicht als glTF lesen.");
    }
  };

  const isItem = CATALOG.some((i) => i.id === key);
  return (
    <main className="flex min-h-dvh flex-col bg-snow text-navy lg:flex-row">
      <section className="relative h-[55dvh] min-h-[320px] flex-1 lg:h-auto">
        <Canvas camera={{ position: [4, 3.5, 5], fov: 40 }} shadows dpr={[1, 2]}>
          <color attach="background" args={["#dfeaf4"]} />
          <hemisphereLight args={["#ffffff", "#9fb4c8", 0.9]} />
          <directionalLight position={[5, 8, 4]} intensity={1.6} castShadow />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[30, 30]} />
            <meshStandardMaterial color="#f4f8fc" />
          </mesh>
          {[-1.6, 1.6].map((x) => (
            <mesh key={x} geometry={hex} position={[x, 0.01, 0]}>
              <meshBasicMaterial color="#a8cbf5" transparent opacity={0.5} />
            </mesh>
          ))}
          {isItem && (
            <group position={[-1.6, 0, 0]}>
              <BuildingModel itemId={key as ItemId} level={level} />
            </group>
          )}
          {fitted && (
            <group position={[1.6, 0, 0]}>
              <primitive object={fitted} />
            </group>
          )}
          <OrbitControls target={[0, 0.8, 0]} makeDefault />
        </Canvas>
        <div className="pointer-events-none absolute left-3 top-3 flex gap-2 text-[11px] font-semibold">
          {isItem && <span className="rounded-full bg-panel/90 px-2.5 py-1">Links: eingebaut</span>}
          <span className="rounded-full bg-panel/90 px-2.5 py-1">Rechts: deine Datei</span>
        </div>
      </section>
      <aside className="flex w-full flex-col gap-3 p-4 lg:w-[360px]">
        <h1 className="text-[18px] font-bold">Modell-Werkbank</h1>
        <p className="text-[12px] leading-snug text-muted">
          Modell ausprobieren, bevor es ins Spiel kommt. Danach mit <code>npm run modelle</code> aufbereiten oder die Zeile
          unten in <code>public/models/manifest.json</code> eintragen.
        </p>
        <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-full bg-accent px-4 text-[14px] font-bold text-panel">
          {file ? `Andere Datei (${file.name})` : ".glb-Datei wählen"}
          <input
            type="file"
            accept=".glb,.gltf,model/gltf-binary"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void load(f);
            }}
          />
        </label>
        {error && <p className="text-[12px] font-semibold text-danger">{error}</p>}
        <label className="text-[12px] font-semibold">
          Ersetzt
          <select
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setFootprint(PART_FIT[e.target.value]?.size ?? 2.1);
            }}
            className="mt-1 h-11 w-full rounded-full bg-panel px-3 text-[13px] ring-1 ring-line"
          >
            <optgroup label="Gebäude">
              {CATALOG.filter((i) => i.category !== "lifts" && i.category !== "pistes").map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.id})
                </option>
              ))}
            </optgroup>
            <optgroup label="Bahnen">
              {Object.entries(PART_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label} ({k})
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {isItem && (
          <label className="text-[12px] font-semibold">
            Ausbaustufe
            <div className="mt-1 grid grid-cols-4 gap-1 rounded-full bg-panel p-1 ring-1 ring-line">
              {[1, 2, 3, 4].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel(l)}
                  className={`min-h-9 rounded-full text-[13px] font-semibold ${level === l ? "bg-accent text-panel" : ""}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </label>
        )}
        <label className="text-[12px] font-semibold">
          {fitKind === "height" ? "Höhe" : "Breite"}: {footprint.toFixed(2)}
          <input type="range" min={0.3} max={4} step={0.05} value={footprint} onChange={(e) => setFootprint(Number(e.target.value))} className="mt-1 w-full" />
        </label>
        <label className="text-[12px] font-semibold">
          Drehung: {yaw}°
          <input type="range" min={0} max={315} step={45} value={yaw} onChange={(e) => setYaw(Number(e.target.value))} className="mt-1 w-full" />
        </label>
        <pre className="overflow-x-auto rounded-[14px] bg-panel p-3 text-[11px] ring-1 ring-line">{snippet}</pre>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(snippet).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="min-h-11 rounded-full bg-ice text-[13px] font-bold"
        >
          {copied ? "Kopiert" : "Zeile kopieren"}
        </button>
        <a href="/" className="text-center text-[12px] font-semibold text-accent">
          Zurück zum Spiel
        </a>
      </aside>
    </main>
  );
}

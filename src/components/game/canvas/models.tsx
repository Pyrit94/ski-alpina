import { useMemo } from "react";
import type { ItemId } from "@/lib/game/types";
import { isLift } from "@/lib/game/catalog";
import { modelAt, useModelLibrary } from "@/lib/game/model-library";
import { STATION_CABLE_Y, cableGap } from "./station";

/**
 * Wallis in six colours.
 *
 * The buildings were boxes with pyramid hats, which read as generic blocks
 * from the camera height this game is played at. The signature of the real
 * architecture is simple and cheap to build: a pale stone base, a dark
 * weathered timber body, and a wide gabled roof carrying snow. Get those three
 * right and a chalet is recognisable at 200 metres.
 */
const wood = "#7a4a2c";
const woodDark = "#4a2d1b";
const timber = "#5c3820";
const stone = "#b9b3a7";
const snow = "#f4f8fc";
const glass = "#9fd2ef";
/** Lit windows. Warm, because that is what makes a village look inhabited. */
const warm = "#ffcc73";
const concrete = "#c8cfd6";
const metal = "#4d5a66";
const red = "#c23b32";

/**
 * A gabled roof with an overhang, and the snow sitting on it.
 *
 * Two wedges rather than a cone: a ridge running along the building is what
 * separates an alpine roof from a circus tent, and the overhang is what casts
 * the shadow line that makes the facade read.
 */
function GableRoof({
  width,
  depth,
  height = 0.62,
  overhang = 0.22,
  y,
}: {
  width: number;
  depth: number;
  height?: number;
  overhang?: number;
  y: number;
}) {
  const w = width + overhang * 2;
  const d = depth + overhang * 2;
  const slope = Math.atan2(height, w / 2);
  const face = Math.hypot(w / 2, height);
  return (
    <group position={[0, y, 0]}>
      {[1, -1].map((side) => (
        <mesh
          key={side}
          position={[(side * w) / 4, height / 2, 0]}
          rotation={[0, 0, side * -slope]}
          castShadow
        >
          <boxGeometry args={[face, 0.1, d]} />
          <meshStandardMaterial color={snow} roughness={0.62} />
        </mesh>
      ))}
      {/* The dark underside of the eaves, which is what reads as a shadow. */}
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[w, 0.08, d]} />
        <meshStandardMaterial color={woodDark} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** A row of windows down one wall. Lit ones are what make a village alive. */
function Windows({
  count,
  y,
  z,
  spacing,
  lit,
  size = 0.2,
}: {
  count: number;
  y: number;
  z: number;
  spacing: number;
  lit?: boolean;
  size?: number;
}) {
  const start = (-(count - 1) * spacing) / 2;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} position={[start + i * spacing, y, z]}>
          <boxGeometry args={[size, size * 1.2, 0.05]} />
          <meshStandardMaterial
            color={lit ? warm : glass}
            emissive={lit ? warm : glass}
            emissiveIntensity={lit ? 1.15 : 0.12}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}

export function BuildingModel({
  itemId,
  constructing,
  lit,
  level = 1,
}: {
  itemId: ItemId;
  constructing?: boolean;
  /** Dusk or later: windows come on. Passed as a boolean so it flips rarely. */
  lit?: boolean;
  /** Car park decks, bus lines: what has been built onto it. */
  level?: number;
}) {
  // A model from public/models wins over the built-in one (see model-library.ts).
  useModelLibrary((st) => st.version);
  // Lift stations share one model, "station"; buildings have their own.
  const file = isLift(itemId) ? modelAt("station") : modelAt(itemId, level);
  const fileGroup = file?.group ?? null;
  const fromFile = useMemo(() => (fileGroup ? fileGroup.clone(true) : null), [fileGroup]);
  // A level without its own file grows the nearest one: wider and taller.
  const extra = file && !isLift(itemId) ? Math.max(0, level - file.level) : 0;
  const opacity = constructing ? 0.72 : 1;
  // A hotel wing shows as more floors.
  const grow = Math.max(0, Math.min(3, level - 1));
  const mat = { opacity, transparent: constructing };
  if (fromFile) {
    return (
      <group scale={[1 + extra * 0.08, 1 + extra * 0.22, 1 + extra * 0.08]}>
        <primitive object={fromFile} />
      </group>
    );
  }
  switch (itemId) {
    case "gondola":
    case "chair":
    case "tbar":
    case "tram":
    case "funitel":
    case "glacier":
      return <Station constructing={constructing} kind={itemId} lit={lit} />;
    case "hotel-resort":
      return <Hotel floors={6 + grow} width={2.7} lit={lit} />;
    case "hotel5":
      return <Hotel floors={5 + grow} width={2.4} lit={lit} />;
    case "hotel3":
      return <Hotel floors={3 + grow} width={2.1} lit={lit} />;
    case "hotel1":
      return <Hotel floors={2 + grow} width={1.8} lit={lit} />;
    case "restaurant":
    case "hut":
    case "apres":
      return <Chalet wide={itemId !== "hut"} accent={itemId === "apres" ? "#5a2f2f" : timber} lit={lit} />;
    case "gastro-hall":
      return <Hotel floors={2} width={2.6} accent="#7a4520" lit={lit} />;
    case "spa":
      return <Hotel floors={2} width={2} accent="#2f6b6b" lit={lit} />;
    case "cablecar-museum":
      return <Hotel floors={2} width={2.2} accent="#8f7a4a" lit={lit} />;
    case "shop":
    case "skischool":
    case "ticket":
      return (
        <Chalet
          wide={false}
          accent={itemId === "ticket" ? "#2b5ea8" : itemId === "skischool" ? "#a84a22" : "#2f6f8f"}
          lit={lit}
        />
      );
    case "parking": {
      // One slab per deck; from the second deck on it is a car park house.
      const decks = Math.max(1, Math.min(4, level));
      return (
        <group>
          <mesh position={[0, 0.08, 0]} receiveShadow>
            <boxGeometry args={[2.4, 0.12, 2.4]} />
            <meshStandardMaterial color="#4a5560" {...mat} />
          </mesh>
          {decks > 1 && (
            <mesh position={[0, (decks - 1) * 0.3 + 0.08, 0]} castShadow>
              <boxGeometry args={[2.2, (decks - 1) * 0.6, 2.2]} />
              <meshStandardMaterial color="#8a939b" {...mat} />
            </mesh>
          )}
          {decks > 1 && (
            <mesh position={[0, (decks - 1) * 0.6 + 0.12, 0]} receiveShadow>
              <boxGeometry args={[2.4, 0.08, 2.4]} />
              <meshStandardMaterial color="#4a5560" {...mat} />
            </mesh>
          )}
          <mesh position={[1.05, 0.7 + (decks - 1) * 0.6, 1.05]}>
            <boxGeometry args={[0.2, 1.2, 0.2]} />
            <meshStandardMaterial color={metal} />
          </mesh>
        </group>
      );
    }
    case "train":
    case "cog": {
      // A station: platform, a roof on posts, a red railcar waiting.
      const long = itemId === "train" ? 2.4 : 1.8;
      return (
        <group>
          <mesh position={[0, 0.1, 0]} receiveShadow>
            <boxGeometry args={[1.4, 0.2, long]} />
            <meshStandardMaterial color="#9aa3ab" {...mat} />
          </mesh>
          <mesh position={[0.32, 0.42, 0]} castShadow>
            <boxGeometry args={[0.52, 0.46, long * 0.8]} />
            <meshStandardMaterial color="#b3262d" {...mat} />
          </mesh>
          <mesh position={[0.32, 0.5, 0]}>
            <boxGeometry args={[0.54, 0.14, long * 0.7]} />
            <meshStandardMaterial color={glass} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[-0.45, 0.55, (s * long) / 3]}>
              <boxGeometry args={[0.08, 0.9, 0.08]} />
              <meshStandardMaterial color={metal} />
            </mesh>
          ))}
          <mesh position={[-0.2, 1.02, 0]} castShadow>
            <boxGeometry args={[1.1, 0.08, long * 0.9]} />
            <meshStandardMaterial color={timber} {...mat} />
          </mesh>
        </group>
      );
    }
    case "bus": {
      // One bus per line, side by side under the shelter.
      const lines = Math.max(1, Math.min(4, level));
      return (
        <group>
          {Array.from({ length: lines }, (_, i) => (
            <group key={i} position={[0, 0, (i - (lines - 1) / 2) * (lines > 1 ? 0.78 : 0)]}>
              <mesh position={[0, 0.45, 0]} castShadow>
                <boxGeometry args={[2.2, 0.9, lines > 1 ? 0.68 : 1.0]} />
                <meshStandardMaterial color={i === 0 ? "#1f7a4d" : "#f2c230"} />
              </mesh>
              <mesh position={[0, 0.95, 0]}>
                <boxGeometry args={[1.6, 0.35, lines > 1 ? 0.56 : 0.82]} />
                <meshStandardMaterial color={glass} />
              </mesh>
            </group>
          ))}
        </group>
      );
    }
    case "snowmaker":
      return (
        <group>
          <mesh position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.12, 0.18, 1.4, 6]} />
            <meshStandardMaterial color={metal} />
          </mesh>
          <mesh position={[0.35, 1.2, 0]} rotation={[0, 0, Math.PI / 5]}>
            <cylinderGeometry args={[0.18, 0.18, 0.7, 8]} />
            <meshStandardMaterial color="#dfe7ee" />
          </mesh>
        </group>
      );
    case "groomer":
      return (
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[1.6, 0.7, 1.1]} />
          <meshStandardMaterial color="#d9890f" />
        </mesh>
      );
    case "workshop":
      return (
        <group>
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[1.8, 1.1, 1.4]} />
            <meshStandardMaterial color="#6d6d6d" />
          </mesh>
          <mesh position={[0, 1.25, 0]}>
            <boxGeometry args={[1.95, 0.12, 1.55]} />
            <meshStandardMaterial color={metal} />
          </mesh>
        </group>
      );
    case "clinic":
      return <Chalet wide={false} accent="#b03434" lit={lit} />;
    case "depot":
      return <Hotel floors={2} width={2.3} accent="#54595e" lit={lit} />;
    case "viewpoint":
      return (
        <group>
          <mesh position={[0, 0.55, 0]}>
            <cylinderGeometry args={[0.55, 0.65, 1.1, 8]} />
            <meshStandardMaterial color={concrete} />
          </mesh>
          <mesh position={[0, 1.2, 0]}>
            <cylinderGeometry args={[0.7, 0.7, 0.08, 8]} />
            <meshStandardMaterial color={snow} />
          </mesh>
        </group>
      );
    case "tree":
      return <Pine />;
    case "rock":
      return (
        <mesh position={[0, 0.25, 0]} castShadow>
          <dodecahedronGeometry args={[0.55, 0]} />
          <meshStandardMaterial color="#6b6864" roughness={0.95} />
        </mesh>
      );
    case "lights":
      return (
        <group>
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 2.2, 6]} />
            <meshStandardMaterial color={metal} />
          </mesh>
          <mesh position={[0, 2.15, 0]}>
            <sphereGeometry args={[0.18, 8, 8]} />
            <meshStandardMaterial color="#f4e27a" emissive="#f4e27a" emissiveIntensity={1.2} />
          </mesh>
        </group>
      );
    default:
      return <Chalet lit={lit} />;
  }
}

/**
 * The Walliser chalet: stone below, timber above, snow on a wide gable.
 *
 * The base matters more than it looks — a building set flat on the ground
 * reads as pasted on, while a lighter plinth under a darker body gives it
 * weight and a place to stand.
 */
function Chalet({
  wide = false,
  accent = timber,
  lit,
}: {
  wide?: boolean;
  accent?: string;
  lit?: boolean;
}) {
  const w = wide ? 2.05 : 1.5;
  const d = wide ? 1.5 : 1.25;
  return (
    <group>
      <mesh position={[0, 0.16, 0]} receiveShadow castShadow>
        <boxGeometry args={[w + 0.14, 0.32, d + 0.14]} />
        <meshStandardMaterial color={stone} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.78, 0]} castShadow>
        <boxGeometry args={[w, 0.92, d]} />
        <meshStandardMaterial color={accent} roughness={0.88} />
      </mesh>
      {/* Balcony rail: one bright line across a dark facade. */}
      <mesh position={[0, 0.72, d / 2 + 0.07]}>
        <boxGeometry args={[w + 0.1, 0.06, 0.06]} />
        <meshStandardMaterial color={wood} roughness={0.8} />
      </mesh>
      <Windows count={wide ? 3 : 2} y={0.98} z={d / 2 + 0.02} spacing={w * 0.34} lit={lit} />
      <mesh position={[0, 0.52, d / 2 + 0.02]}>
        <boxGeometry args={[0.26, 0.46, 0.05]} />
        <meshStandardMaterial color="#2a1a10" roughness={0.9} />
      </mesh>
      <GableRoof width={w} depth={d} height={wide ? 0.66 : 0.56} y={1.24} />
      <mesh position={[w * 0.3, 1.62, -d * 0.2]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 0.5, 6]} />
        <meshStandardMaterial color="#4a4038" roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * A hotel: the same language, stacked.
 *
 * Floors are read from the window rows rather than from the box, so a
 * five-storey palace looks like more building and not just a taller one.
 */
function Hotel({
  floors,
  width,
  accent = woodDark,
  lit,
}: {
  floors: number;
  width: number;
  accent?: string;
  lit?: boolean;
}) {
  const h = 0.5 * floors;
  const d = width * 0.76;
  return (
    <group>
      <mesh position={[0, 0.18, 0]} receiveShadow castShadow>
        <boxGeometry args={[width + 0.16, 0.36, d + 0.16]} />
        <meshStandardMaterial color={stone} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.36 + h / 2, 0]} castShadow>
        <boxGeometry args={[width, h, d]} />
        <meshStandardMaterial color={accent} roughness={0.82} />
      </mesh>
      {Array.from({ length: floors }).map((_, i) => (
        <group key={i}>
          <Windows
            count={Math.max(2, Math.round(width * 1.5))}
            y={0.62 + i * 0.5}
            z={d / 2 + 0.02}
            spacing={width * 0.3}
            lit={lit}
            size={0.17}
          />
          {/* A band between floors: horizontal lines are what give scale. */}
          <mesh position={[0, 0.38 + i * 0.5, d / 2 + 0.03]}>
            <boxGeometry args={[width + 0.04, 0.04, 0.05]} />
            <meshStandardMaterial color={wood} roughness={0.85} />
          </mesh>
        </group>
      ))}
      <GableRoof width={width} depth={d} height={0.5} overhang={0.26} y={0.36 + h} />
    </group>
  );
}

/**
 * A lift station, turned so the line runs out along +z.
 *
 * What makes a real one readable is the horizontal bullwheel the rope turns
 * round, the terminal or canopy over it, and the operator's cabin beside the
 * boarding area. Three kinds:
 *
 * - T-bar: a small hut and a steel mast carrying the wheel.
 * - Chairlift: an open canopy on posts over the wheel, a boarding platform and
 *   an operator's cabin.
 * - Cabin cableways: a closed hall with the line entering through its open
 *   gable, the wheel just inside.
 */
function Station({
  kind,
  constructing,
  lit,
}: {
  kind: ItemId;
  constructing?: boolean;
  lit?: boolean;
}) {
  const ghost = { transparent: constructing, opacity: constructing ? 0.7 : 1 };
  const gap = cableGap(kind);
  const wheelY = STATION_CABLE_Y;
  // The bullwheel: a flat drum the rope wraps, the one shape that says
  // "cableway" from any angle.
  const wheel = (
    <group position={[0, wheelY, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[gap + 0.04, gap + 0.04, 0.09, 20]} />
        <meshStandardMaterial color="#33414d" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.12, 8]} />
        <meshStandardMaterial color={metal} metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  );
  const pane = (x: number, y: number, z: number, w: number, h: number, ry = 0) => (
    <mesh position={[x, y, z]} rotation={[0, ry, 0]}>
      <boxGeometry args={[w, h, 0.04]} />
      <meshStandardMaterial
        color={lit ? warm : glass}
        emissive={lit ? warm : glass}
        emissiveIntensity={lit ? 0.9 : 0.15}
        toneMapped={!lit}
      />
    </mesh>
  );

  if (kind === "tbar") {
    return (
      <group>
        <mesh position={[0, 0.06, 0]} receiveShadow>
          <boxGeometry args={[1.5, 0.12, 1.4]} />
          <meshStandardMaterial color={concrete} roughness={0.92} />
        </mesh>
        {/* Steel mast holding the wheel out over the track. */}
        <mesh position={[0, wheelY / 2, -0.32]} castShadow>
          <boxGeometry args={[0.14, wheelY, 0.14]} />
          <meshStandardMaterial color={metal} metalness={0.35} roughness={0.6} />
        </mesh>
        <mesh position={[0, wheelY - 0.05, -0.16]}>
          <boxGeometry args={[0.1, 0.1, 0.36]} />
          <meshStandardMaterial color={metal} metalness={0.35} roughness={0.6} />
        </mesh>
        {wheel}
        {/* Operator's hut beside the start. */}
        <group position={[0.72, 0, -0.1]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[0.6, 0.72, 0.62]} />
            <meshStandardMaterial color="#8a5a3a" roughness={0.85} {...ghost} />
          </mesh>
          {pane(-0.31, 0.52, 0, 0.36, 0.22, Math.PI / 2)}
          <mesh position={[0, 0.84, 0]} castShadow>
            <boxGeometry args={[0.74, 0.1, 0.76]} />
            <meshStandardMaterial color={snow} roughness={0.62} />
          </mesh>
        </group>
      </group>
    );
  }

  const cabinway = kind === "gondola" || kind === "tram" || kind === "funitel" || kind === "glacier";
  if (!cabinway) {
    // Chairlift: an open canopy on posts, the wheel under it.
    const w = 1.5;
    const d = 1.7;
    const roofY = wheelY + 0.3;
    return (
      <group>
        <mesh position={[0, 0.08, -0.1]} receiveShadow>
          <boxGeometry args={[w + 0.9, 0.16, d + 0.6]} />
          <meshStandardMaterial color={concrete} roughness={0.92} />
        </mesh>
        {/* Boarding platform the chairs swing round over. */}
        <mesh position={[0, 0.2, 0.55]} receiveShadow>
          <boxGeometry args={[w * 0.9, 0.08, 0.7]} />
          <meshStandardMaterial color="#7a5638" roughness={0.9} />
        </mesh>
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} position={[(sx * w) / 2, roofY / 2, -0.1 + (sz * d) / 2.4]} castShadow>
              <boxGeometry args={[0.1, roofY, 0.1]} />
              <meshStandardMaterial color={metal} metalness={0.35} roughness={0.6} />
            </mesh>
          )),
        )}
        {wheel}
        <mesh position={[0, roofY, -0.1]} castShadow>
          <boxGeometry args={[w + 0.3, 0.12, d + 0.2]} />
          <meshStandardMaterial color={snow} roughness={0.6} {...ghost} />
        </mesh>
        <mesh position={[0, roofY - 0.1, -0.1]}>
          <boxGeometry args={[w + 0.32, 0.08, d + 0.22]} />
          <meshStandardMaterial color={red} roughness={0.5} />
        </mesh>
        {/* Operator's cabin, windows facing the boarding area. */}
        <group position={[w / 2 + 0.55, 0, 0.2]}>
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[0.7, 0.9, 0.8]} />
            <meshStandardMaterial color="#e6edf4" roughness={0.45} {...ghost} />
          </mesh>
          {pane(-0.36, 0.68, 0, 0.5, 0.32, Math.PI / 2)}
          {pane(0, 0.68, 0.41, 0.4, 0.32)}
          <mesh position={[0, 1.06, 0]} castShadow>
            <boxGeometry args={[0.84, 0.1, 0.94]} />
            <meshStandardMaterial color={snow} roughness={0.62} />
          </mesh>
        </group>
      </group>
    );
  }

  // Cabin cableways: a closed hall, the line entering through the open gable
  // on +z, the wheel just inside it.
  const big = kind === "funitel" || kind === "tram" || kind === "glacier";
  const w = big ? 2.3 : 2;
  const d = big ? 2.6 : 2.3;
  const hallTop = wheelY + 0.35;
  const hz = -d * 0.22;
  return (
    <group>
      <mesh position={[0, 0.1, hz]} receiveShadow>
        <boxGeometry args={[w + 0.6, 0.2, d + 0.5]} />
        <meshStandardMaterial color={concrete} roughness={0.92} />
      </mesh>
      <mesh position={[0, hallTop / 2 + 0.1, hz - d * 0.18]} castShadow>
        <boxGeometry args={[w, hallTop - 0.2, d * 0.64]} />
        <meshStandardMaterial color="#e6edf4" metalness={0.15} roughness={0.42} {...ghost} />
      </mesh>
      {/* Glazed side wall of the boarding hall. */}
      {pane(w / 2 + 0.01, hallTop * 0.55, hz - d * 0.18, d * 0.5, 0.4, Math.PI / 2)}
      {pane(-w / 2 - 0.01, hallTop * 0.55, hz - d * 0.18, d * 0.5, 0.4, Math.PI / 2)}
      {/* Open front: posts carrying the roof over the wheel. */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[(sx * w) / 2.1, hallTop / 2 + 0.1, hz + d * 0.42]} castShadow>
          <boxGeometry args={[0.14, hallTop - 0.2, 0.14]} />
          <meshStandardMaterial color={metal} metalness={0.35} roughness={0.6} />
        </mesh>
      ))}
      {wheel}
      <group position={[0, 0, hz]}>
        <GableRoof width={w} depth={d} height={0.46} overhang={0.25} y={hallTop} />
      </group>
      {kind === "gondola" && (
        <group position={[w * 0.28, 0.66, hz - d * 0.1]}>
          <mesh castShadow>
            <boxGeometry args={[0.4, 0.44, 0.34]} />
            <meshStandardMaterial color={red} metalness={0.25} roughness={0.42} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/**
 * An arolla pine.
 *
 * Four tiers instead of three, narrowing faster, with the snow cap only on the
 * top: the old one was a fat cone that read as a bush. Trees cover more of the
 * screen than any building, so their silhouette sets the tone of the whole
 * mountain.
 */
export function Pine({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 0.48, 5]} />
        <meshStandardMaterial color="#3d2b1d" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.78, 0]} castShadow>
        <coneGeometry args={[0.5, 0.95, 8]} />
        <meshStandardMaterial color="#16301f" roughness={0.92} />
      </mesh>
      <mesh position={[0, 1.24, 0]} castShadow>
        <coneGeometry args={[0.38, 0.8, 8]} />
        <meshStandardMaterial color="#1d3d28" roughness={0.92} />
      </mesh>
      <mesh position={[0, 1.66, 0]}>
        <coneGeometry args={[0.25, 0.62, 8]} />
        <meshStandardMaterial color="#254a30" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.02, 0]}>
        <coneGeometry args={[0.13, 0.34, 8]} />
        <meshStandardMaterial color={snow} roughness={0.6} />
      </mesh>
    </group>
  );
}

// `GondolaCabin` lived here as a component. Carriers are drawn as instanced
// meshes now — one draw call for every cabin on the mountain instead of one
// per cabin — so their geometry is built in `carrierParts` in SkiScene.

export function SkierMesh() {
  return (
    <group>
      <mesh position={[0, 0.22, 0]}>
        <capsuleGeometry args={[0.07, 0.18, 4, 8]} />
        <meshStandardMaterial color="#c23b32" />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#f0d8c0" />
      </mesh>
    </group>
  );
}

// Hand-built geometry moved to ./geometry: exporting plain functions from a
// file of components breaks Fast Refresh for the whole file.

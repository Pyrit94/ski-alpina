import { useMemo } from "react";
import * as THREE from "three";
import type { ItemId } from "@/lib/game/types";

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
}: {
  itemId: ItemId;
  constructing?: boolean;
  /** Dusk or later: windows come on. Passed as a boolean so it flips rarely. */
  lit?: boolean;
}) {
  const opacity = constructing ? 0.72 : 1;
  const mat = { opacity, transparent: constructing };
  switch (itemId) {
    case "gondola":
    case "chair":
    case "tbar":
    case "tram":
    case "funitel":
    case "glacier":
      return <Station constructing={constructing} kind={itemId} lit={lit} />;
    case "hotel-resort":
      return <Hotel floors={6} width={2.7} lit={lit} />;
    case "hotel5":
      return <Hotel floors={5} width={2.4} lit={lit} />;
    case "hotel3":
      return <Hotel floors={3} width={2.1} lit={lit} />;
    case "hotel1":
      return <Hotel floors={2} width={1.8} lit={lit} />;
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
    case "parking":
      return (
        <group>
          <mesh position={[0, 0.08, 0]} receiveShadow>
            <boxGeometry args={[2.4, 0.12, 2.4]} />
            <meshStandardMaterial color="#4a5560" {...mat} />
          </mesh>
          <mesh position={[0, 0.7, 0]}>
            <boxGeometry args={[0.2, 1.2, 0.2]} />
            <meshStandardMaterial color={metal} />
          </mesh>
        </group>
      );
    case "bus":
      return (
        <group>
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[2.2, 0.9, 1.1]} />
            <meshStandardMaterial color="#1f7a4d" />
          </mesh>
          <mesh position={[0, 0.95, 0]}>
            <boxGeometry args={[1.6, 0.35, 0.9]} />
            <meshStandardMaterial color={glass} />
          </mesh>
        </group>
      );
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
 * A cableway station: a shed on piers with the machinery on show.
 *
 * The lift is the thing a ski resort is built around, so its stations should
 * be the most recognisable object on the mountain. What makes one readable is
 * the open side you can see through, the drive wheel above it, and the sheer
 * bulk relative to a chalet.
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
  // Cabin cableways get the taller hall; surface and chair lifts a low one.
  const cabinway = kind === "gondola" || kind === "tram" || kind === "funitel" || kind === "glacier";
  const big = kind === "funitel" || kind === "tram" || kind === "glacier";
  const w = big ? 2.2 : cabinway ? 1.95 : 1.6;
  const d = big ? 1.9 : 1.65;
  const hallY = cabinway ? 1.15 : 0.9;
  const ghost = { transparent: constructing, opacity: constructing ? 0.7 : 1 };
  return (
    <group>
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[w + 0.5, 0.2, d + 0.4]} />
        <meshStandardMaterial color={concrete} roughness={0.92} />
      </mesh>
      {/* Piers, so the hall stands over the platform instead of on it. */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[(sx * w) / 2.4, 0.4, (sz * d) / 2.6]} castShadow>
            <boxGeometry args={[0.16, 0.5, 0.16]} />
            <meshStandardMaterial color={metal} roughness={0.6} metalness={0.35} />
          </mesh>
        )),
      )}
      <mesh position={[0, hallY, 0]} castShadow>
        <boxGeometry args={[w, hallY - 0.2, d]} />
        <meshStandardMaterial color="#e6edf4" metalness={0.15} roughness={0.42} {...ghost} />
      </mesh>
      {/* The open gable end a lift runs through. */}
      <mesh position={[0, hallY, d / 2 + 0.02]}>
        <boxGeometry args={[w * 0.62, (hallY - 0.2) * 0.66, 0.06]} />
        <meshStandardMaterial
          color={lit ? warm : "#2a3a48"}
          emissive={lit ? warm : "#000000"}
          emissiveIntensity={lit ? 0.9 : 0}
          toneMapped={!lit}
        />
      </mesh>
      <GableRoof width={w} depth={d} height={0.42} overhang={0.3} y={hallY + (hallY - 0.2) / 2} />
      {/* Drive wheel: the one silhouette that says "cableway" on its own. */}
      <mesh position={[0, hallY + 0.34, -d * 0.1]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.1, 16]} />
        <meshStandardMaterial color="#33414d" metalness={0.5} roughness={0.4} />
      </mesh>
      {cabinway && (
        <group position={[w * 0.34, 0.62, d * 0.5]}>
          <mesh castShadow>
            <boxGeometry args={[0.4, 0.44, 0.34]} />
            <meshStandardMaterial color={red} metalness={0.25} roughness={0.42} />
          </mesh>
          <mesh position={[0, 0.06, 0.18]}>
            <boxGeometry args={[0.28, 0.2, 0.03]} />
            <meshStandardMaterial color={glass} emissive={glass} emissiveIntensity={0.25} />
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

export function GondolaCabin() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.42, 0.34, 0.32]} />
        <meshStandardMaterial color={red} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.08, 0.12]}>
        <boxGeometry args={[0.28, 0.14, 0.04]} />
        <meshStandardMaterial color="#c9e7f7" />
      </mesh>
    </group>
  );
}

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

export function makeHexGeometry(size: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = size * Math.cos(a);
    const y = size * Math.sin(a);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  return g;
}

export function useHexGeometry(size: number) {
  return useMemo(() => makeHexGeometry(size), [size]);
}

export function ribbonGeometry(points: THREE.Vector3[], width: number) {
  if (points.length < 2) return new THREE.BufferGeometry();
  const verts: number[] = [];
  const norms: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const dir = next.clone().sub(prev);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(up, dir).normalize().multiplyScalar(width * 0.5);
    const a = p.clone().add(side);
    const b = p.clone().sub(side);
    a.y += 0.08;
    b.y += 0.08;
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    norms.push(0, 1, 0, 0, 1, 0);
  }
  const idx: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const i0 = i * 2;
    idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(norms, 3));
  geo.setIndex(idx);
  return geo;
}

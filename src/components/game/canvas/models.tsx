import { useMemo } from "react";
import * as THREE from "three";
import type { ItemId } from "@/lib/game/types";

const wood = "#6d4328";
const woodDark = "#4a2d1b";
const snow = "#f4f8fc";
const glass = "#9fd2ef";
const concrete = "#c8cfd6";
const metal = "#4d5a66";
const red = "#c23b32";

export function BuildingModel({ itemId, constructing }: { itemId: ItemId; constructing?: boolean }) {
  const opacity = constructing ? 0.72 : 1;
  const mat = { opacity, transparent: constructing };
  switch (itemId) {
    case "gondola":
    case "chair":
    case "tbar":
    case "tram":
      return <Station constructing={constructing} kind={itemId} />;
    case "hotel5":
      return <Hotel floors={5} width={2.4} />;
    case "hotel3":
      return <Hotel floors={3} width={2.1} />;
    case "hotel1":
      return <Hotel floors={2} width={1.8} />;
    case "restaurant":
    case "hut":
    case "apres":
      return <Chalet wide={itemId === "restaurant"} />;
    case "spa":
      return <Hotel floors={2} width={2} accent="#3d8a8a" />;
    case "shop":
    case "skischool":
    case "ticket":
      return <Chalet wide={false} accent={itemId === "ticket" ? "#1a73e8" : wood} />;
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
      return <Chalet wide={false} accent="#d23b3b" />;
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
      return <Chalet />;
  }
}

function Chalet({ wide = false, accent = wood }: { wide?: boolean; accent?: string }) {
  const w = wide ? 2.1 : 1.55;
  return (
    <group>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[w, 1.1, 1.35]} />
        <meshStandardMaterial color={accent} roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.25, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[wide ? 1.45 : 1.15, 0.85, 4]} />
        <meshStandardMaterial color={snow} roughness={0.55} />
      </mesh>
      <mesh position={[w * 0.28, 1.55, 0.15]}>
        <cylinderGeometry args={[0.08, 0.1, 0.45, 6]} />
        <meshStandardMaterial color="#4a4038" />
      </mesh>
      <mesh position={[0, 0.55, 0.68]}>
        <boxGeometry args={[0.28, 0.42, 0.06]} />
        <meshStandardMaterial color="#1c140e" />
      </mesh>
    </group>
  );
}

function Hotel({ floors, width, accent = woodDark }: { floors: number; width: number; accent?: string }) {
  const h = 0.55 * floors;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[width, h, width * 0.78]} />
        <meshStandardMaterial color={accent} roughness={0.8} />
      </mesh>
      <mesh position={[0, h + 0.12, 0]}>
        <boxGeometry args={[width + 0.15, 0.18, width * 0.82]} />
        <meshStandardMaterial color={snow} />
      </mesh>
      {Array.from({ length: floors }).map((_, i) => (
        <mesh key={i} position={[width * 0.32, 0.28 + i * 0.55, width * 0.4]}>
          <boxGeometry args={[0.22, 0.22, 0.04]} />
          <meshStandardMaterial color={glass} emissive={glass} emissiveIntensity={0.15} />
        </mesh>
      ))}
    </group>
  );
}

function Station({ kind, constructing }: { kind: ItemId; constructing?: boolean }) {
  const roof = kind === "gondola" || kind === "tram" ? 1.9 : 1.5;
  return (
    <group>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[2.3, 0.18, 2.1]} />
        <meshStandardMaterial color={concrete} />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[1.7, 1.2, 1.5]} />
        <meshStandardMaterial color="#dfe7ee" metalness={0.2} roughness={0.35} transparent={constructing} opacity={constructing ? 0.7 : 1} />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <boxGeometry args={[roof, 0.16, 1.7]} />
        <meshStandardMaterial color={snow} />
      </mesh>
      <mesh position={[0, 1.72, 0]}>
        <boxGeometry args={[0.55, 0.08, 0.55]} />
        <meshStandardMaterial color="#2a3a48" />
      </mesh>
      {kind === "gondola" && (
        <mesh position={[0.55, 0.55, 0.9]} rotation={[0, 0.2, 0]}>
          <boxGeometry args={[0.42, 0.38, 0.32]} />
          <meshStandardMaterial color={red} />
        </mesh>
      )}
    </group>
  );
}

export function Pine({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.07, 0.1, 0.55, 5]} />
        <meshStandardMaterial color="#4a3424" />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <coneGeometry args={[0.55, 1.05, 7]} />
        <meshStandardMaterial color="#1d3c2c" />
      </mesh>
      <mesh position={[0, 1.45, 0]}>
        <coneGeometry args={[0.38, 0.75, 7]} />
        <meshStandardMaterial color="#254a34" />
      </mesh>
      <mesh position={[0, 1.85, 0]}>
        <coneGeometry args={[0.22, 0.38, 7]} />
        <meshStandardMaterial color={snow} />
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

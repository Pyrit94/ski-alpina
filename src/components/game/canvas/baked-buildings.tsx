import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ItemId } from "@/lib/game/types";
import { BuildingModel } from "./models";

/**
 * Finished buildings as instances, one or two draw calls per kind.
 *
 * A chalet in models.tsx is eleven meshes — plinth, body, rail, windows, door,
 * roof halves, eaves, chimney — and every one was its own draw call, plus
 * another in the shadow pass. Five seed huts alone cost over a hundred calls,
 * and a grown resort sailed past the 150-call budget on buildings alone.
 *
 * The models stay authored as JSX. The first time a kind is needed, its model
 * is mounted once, invisibly; its meshes are flattened into one geometry with
 * the material colours baked into vertex colours, and the prototype is thrown
 * away. Every finished building of that kind is then an instance of that one
 * geometry. Lit windows go into a second, unlit geometry so they still glow.
 *
 * What is lost: per-part roughness and metalness, which do not read at the
 * distance this game is played at. Buildings that are still dropping in or
 * under construction keep the original per-mesh path, with its animation and
 * transparency.
 */

interface Baked {
  solid: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
}

const bakedCache = new Map<string, Baked>();

/** Shared by every baked building. */
const SOLID = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.04 });
const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

const relative = new THREE.Matrix4();
const inverseRoot = new THREE.Matrix4();

function bake(root: THREE.Object3D): Baked {
  root.updateMatrixWorld(true);
  inverseRoot.copy(root.matrixWorld).invert();
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const colour = new THREE.Color();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    let geo = mesh.geometry.clone();
    if (geo.index) geo = geo.toNonIndexed();
    for (const name of Object.keys(geo.attributes)) {
      if (name !== "position" && name !== "normal") geo.deleteAttribute(name);
    }
    relative.multiplyMatrices(inverseRoot, mesh.matrixWorld);
    geo.applyMatrix4(relative);

    const emissive = mat.emissive ? Math.max(mat.emissive.r, mat.emissive.g, mat.emissive.b) * (mat.emissiveIntensity ?? 0) : 0;
    const glows = emissive > 0.4;
    if (glows) colour.copy(mat.emissive).multiplyScalar(Math.min(1.4, mat.emissiveIntensity));
    else colour.copy(mat.color ?? colour.set("#ffffff"));

    const count = geo.attributes.position!.count;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colours[i * 3] = colour.r;
      colours[i * 3 + 1] = colour.g;
      colours[i * 3 + 2] = colour.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    (glows ? glow : solid).push(geo);
  });
  const merge = (parts: THREE.BufferGeometry[]) => {
    if (parts.length === 0) return null;
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    merged?.computeBoundingSphere();
    return merged;
  };
  return { solid: merge(solid), glow: merge(glow) };
}

export interface Placement {
  /** Building id, or null for decoration that cannot be selected. */
  id: string | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const one = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Every finished building of one kind. Mount with `key={itemId + lit}`: a
 * change of lighting is a different bake.
 */
export function BuildingInstances({
  itemId,
  lit,
  placements,
  shadows,
  onPick,
}: {
  itemId: ItemId;
  lit: boolean;
  placements: Placement[];
  shadows: boolean;
  onPick: (id: string) => void;
}) {
  const key = `${itemId}|${lit ? 1 : 0}`;
  const [baked, setBaked] = useState<Baked | null>(() => bakedCache.get(key) ?? null);
  const proto = useRef<THREE.Group>(null);
  const solid = useRef<THREE.InstancedMesh>(null);
  const glow = useRef<THREE.InstancedMesh>(null);
  // Capacity grows in blocks so a new building does not reallocate the buffer.
  const capacity = Math.max(4, Math.ceil(placements.length / 8) * 8);

  useLayoutEffect(() => {
    if (baked || !proto.current) return;
    const b = bake(proto.current);
    bakedCache.set(key, b);
    setBaked(b);
  }, [baked, key]);

  useLayoutEffect(() => {
    for (const inst of [solid.current, glow.current]) {
      if (!inst) continue;
      placements.forEach((pl, i) => {
        q.setFromAxisAngle(UP, pl.yaw);
        inst.setMatrixAt(i, m4.compose(p.set(pl.x, pl.y, pl.z), q, one));
      });
      inst.count = placements.length;
      inst.instanceMatrix.needsUpdate = true;
      // Culling and picking use the instances' bounds, not the prototype's.
      inst.boundingSphere = null;
      inst.computeBoundingSphere();
    }
  }, [placements, baked, capacity]);

  const ids = useMemo(() => placements.map((pl) => pl.id), [placements]);
  const pick = (e: ThreeEvent<MouseEvent>) => {
    const id = e.instanceId === undefined ? null : ids[e.instanceId];
    if (!id) return;
    e.stopPropagation();
    onPick(id);
  };

  if (!baked) {
    return (
      <group ref={proto} visible={false}>
        <BuildingModel itemId={itemId} lit={lit} />
      </group>
    );
  }
  return (
    <group>
      {baked.solid && (
        <instancedMesh
          key={`s${capacity}`}
          ref={solid}
          args={[baked.solid, SOLID, capacity]}
          castShadow={shadows}
          receiveShadow={shadows}
          onClick={pick}
        />
      )}
      {baked.glow && (
        <instancedMesh key={`g${capacity}`} ref={glow} args={[baked.glow, GLOW, capacity]} onClick={pick} />
      )}
    </group>
  );
}

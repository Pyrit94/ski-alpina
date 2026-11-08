import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { ItemId } from "@/lib/game/types";
import { BuildingModel } from "./models";
import { bake, bakedCache, GLOW, SOLID, type Baked } from "./bake";
import { useModelLibrary } from "@/lib/game/model-library";

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
  level = 1,
}: {
  itemId: ItemId;
  /** Expansion level: a hotel wing or car park deck changes the model. */
  level?: number;
  lit: boolean;
  placements: Placement[];
  shadows: boolean;
  onPick: (id: string) => void;
}) {
  const version = useModelLibrary((s) => s.version);
  const key = `${itemId}|${level}|${lit ? 1 : 0}|${version}`;
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
        <BuildingModel itemId={itemId} lit={lit} level={level} />
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

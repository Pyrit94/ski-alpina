import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { relaxLine } from "@ski/shared";
import { getHeightmap, surfaceY } from "@/lib/game/alpine";
import { hexToWorld } from "@/lib/game/hex";
import { LAND_S } from "@/lib/game/juice";
import { useWorldBuildings, useWorldPistes } from "./use-world";
import { DUST_N, GLINT_LANES, GLINT_N, POOL, alongLine, burstLength, dustAt, glintAt } from "./bursts";

/** Only what was built this long ago or less gets a burst; older ones arrived with a snapshot. */
const FRESH_MS = 3000;

interface Burst {
  kind: "dust" | "glint";
  /** Date.now() at which it starts. */
  start: number;
  seed: number;
  /** Where each of its particles is anchored (one point for dust). */
  at: THREE.Vector3[];
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aKind;
  uniform float uPx;
  varying float vAlpha;
  varying float vKind;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(96.0, aSize * uPx / max(0.5, -mv.z));
    vAlpha = aAlpha;
    vKind = aKind;
  }
`;

const FRAG = /* glsl */ `
  varying float vAlpha;
  varying float vKind;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (vKind < 0.5) {
      // Powder: a soft white puff with a faint blue shade toward its edge,
      // so it reads against snow instead of vanishing into it.
      float a = smoothstep(0.5, 0.12, d);
      vec3 col = mix(vec3(1.0), vec3(0.72, 0.8, 0.9), smoothstep(0.1, 0.45, d));
      gl_FragColor = vec4(col, a * vAlpha);
    } else {
      // A glint: a bright core and a thin four-point star.
      float core = smoothstep(0.22, 0.0, d);
      float star = max(smoothstep(0.06, 0.0, abs(p.x)), smoothstep(0.06, 0.0, abs(p.y))) * smoothstep(0.5, 0.05, d);
      float a = max(core, star * 0.85);
      vec3 col = mix(vec3(0.62, 0.82, 1.0), vec3(1.0), core);
      gl_FragColor = vec4(col, a * vAlpha);
    }
  }
`;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * The build moment in the world: a ring of snow dust where a new building or
 * station lands, a shimmer down a new run. Every burst shares one points
 * object from a fixed pool — one draw call while anything is in the air,
 * none when nothing is (the object is hidden then).
 */
export function BuildBursts() {
  const buildings = useWorldBuildings();
  const pistes = useWorldPistes();
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const points = useRef<THREE.Points>(null);
  const bursts = useRef<Burst[]>([]);
  const seen = useRef(new Set<string>());

  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(POOL * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(POOL), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(POOL), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aKind", new THREE.BufferAttribute(new Float32Array(POOL), 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uPx: { value: 400 } },
      transparent: true,
      depthWrite: false,
    });
    return { geo: g, mat: m };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  // New buildings (stations too) and runs: queue their burst.
  useEffect(() => {
    const now = Date.now();
    const quiet = reducedMotion();
    const hm = getHeightmap();
    for (const b of buildings) {
      if (seen.current.has(b.id)) continue;
      seen.current.add(b.id);
      if (quiet || b.acquired || now - b.builtAt > FRESH_MS) continue;
      const { x, z } = hexToWorld(b.q, b.r);
      bursts.current.push({
        kind: "dust",
        start: Math.max(now, b.builtAt + LAND_S * 1000),
        seed: b.builtAt % 997,
        at: [new THREE.Vector3(x, surfaceY(hm, x, z), z)],
      });
    }
    for (const p of pistes) {
      if (seen.current.has(p.id)) continue;
      seen.current.add(p.id);
      if (quiet || p.acquired || now - p.builtAt > FRESH_MS || p.hexes.length < 2) continue;
      const centres = p.hexes.map((h) => hexToWorld(h.q, h.r));
      const line = p.difficulty === "road" ? centres : relaxLine(centres, 2);
      const n = Math.min(GLINT_N, Math.max(8, Math.round(p.hexes.length * 1.5)));
      const steps = alongLine(line, n);
      // Lanes across the run: sideways from the line's direction at each step.
      const at: THREE.Vector3[] = [];
      steps.forEach((c, i) => {
        const a = steps[Math.max(0, i - 1)]!;
        const b = steps[Math.min(steps.length - 1, i + 1)]!;
        const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const sx = -(b.z - a.z) / len;
        const sz = (b.x - a.x) / len;
        for (let k = 0; k < GLINT_LANES; k++) {
          const off = (k - (GLINT_LANES - 1) / 2) * 0.75;
          const x = c.x + sx * off;
          const z = c.z + sz * off;
          at.push(new THREE.Vector3(x, surfaceY(hm, x, z), z));
        }
      });
      bursts.current.push({ kind: "glint", start: now, seed: 0, at });
    }
  }, [buildings, pistes]);

  useFrame(() => {
    const obj = points.current;
    if (!obj) return;
    const geo = obj.geometry;
    const mat = obj.material as THREE.ShaderMaterial;
    const now = Date.now();
    const live = bursts.current.filter((b) => now - b.start < burstLength(b.kind) * 1000);
    bursts.current = live;
    if (live.length === 0) {
      obj.visible = false;
      return;
    }
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const sz = geo.attributes.aSize as THREE.BufferAttribute;
    const al = geo.attributes.aAlpha as THREE.BufferAttribute;
    const kd = geo.attributes.aKind as THREE.BufferAttribute;
    let n = 0;
    for (const b of live) {
      const t = (now - b.start) / 1000;
      if (t < 0) continue;
      const count = b.kind === "dust" ? DUST_N : b.at.length;
      const steps = count / GLINT_LANES;
      for (let i = 0; i < count && n < POOL; i++) {
        const p = b.kind === "dust" ? dustAt(i, t, b.seed) : glintAt(Math.floor(i / GLINT_LANES), steps, t, i % GLINT_LANES);
        if (!p || p.alpha <= 0.01) continue;
        const o = b.kind === "dust" ? b.at[0]! : b.at[i]!;
        pos.setXYZ(n, o.x + p.dx, o.y + p.dy, o.z + p.dz);
        sz.setX(n, p.size);
        al.setX(n, p.alpha);
        kd.setX(n, b.kind === "dust" ? 0 : 1);
        n++;
      }
    }
    geo.setDrawRange(0, n);
    obj.visible = n > 0;
    if (n === 0) return;
    pos.needsUpdate = true;
    sz.needsUpdate = true;
    al.needsUpdate = true;
    kd.needsUpdate = true;
    // Point sizes in world units: pixels per unit at distance 1.
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
    mat.uniforms.uPx!.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan((fov * Math.PI) / 360));
  });

  return <points ref={points} geometry={geo} material={mat} frustumCulled={false} visible={false} renderOrder={5} />;
}

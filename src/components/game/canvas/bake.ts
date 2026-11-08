import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Flatten a model into one or two geometries with its colours in the
 * vertices: the step that lets a building, a carrier or a pylon be drawn as
 * instances. Shared by baked-buildings.tsx and the lift parts in
 * SkiScene.tsx; its own module so those files keep exporting components only.
 */

export interface Baked {
  solid: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
}

export const bakedCache = new Map<string, Baked>();

/**
 * Shared by every baked building: soft cel shading, four tones from shade to
 * light, so every building — built-in or from a file — reads in one style.
 */
function toonRamp(): THREE.DataTexture {
  const tones = [150, 196, 228, 255];
  const data = new Uint8Array(tones.length * 4);
  tones.forEach((t, i) => data.set([t, t, t, 255], i * 4));
  const tex = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
export const SOLID = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });

/**
 * One palette for everything: colours a little richer and their darks lifted,
 * as in a hand-painted city builder, whatever file or code they came from.
 */
const hsl = { h: 0, s: 0, l: 0 };
function grade(c: THREE.Color): THREE.Color {
  c.getHSL(hsl);
  return c.setHSL(hsl.h, Math.min(1, hsl.s * 1.12), Math.min(0.92, hsl.l * 0.88 + 0.07));
}

/** Pixels of a texture, read once, to colour vertices from their UVs. */
const pixelCache = new Map<string, { data: Uint8ClampedArray; w: number; h: number } | null>();
function pixelsOf(tex: THREE.Texture): { data: Uint8ClampedArray; w: number; h: number } | null {
  if (pixelCache.has(tex.uuid)) return pixelCache.get(tex.uuid)!;
  let out: { data: Uint8ClampedArray; w: number; h: number } | null = null;
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (img && img.width > 0 && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      out = { data: ctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
    }
  }
  pixelCache.set(tex.uuid, out);
  return out;
}
export const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

const relative = new THREE.Matrix4();
const tmpColour = new THREE.Color();
const inverseRoot = new THREE.Matrix4();

export function bake(root: THREE.Object3D): Baked {
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
    // A model from a file brings its colour as vertex colours or as a
    // palette texture; both are read into the baked vertex colours.
    const ownColours = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute | undefined;
    const pixels = mat.map && uv ? pixelsOf(mat.map) : null;
    const flipY = mat.map?.flipY ?? false;
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
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.copy(colour);
      if (ownColours) c.multiply(tmpColour.setRGB(ownColours.getX(i), ownColours.getY(i), ownColours.getZ(i)));
      if (pixels && uv) {
        const u = ((uv.getX(i) % 1) + 1) % 1;
        const v = ((uv.getY(i) % 1) + 1) % 1;
        const px = Math.min(pixels.w - 1, Math.floor(u * pixels.w));
        const py = Math.min(pixels.h - 1, Math.floor((flipY ? 1 - v : v) * pixels.h));
        const o = (py * pixels.w + px) * 4;
        c.multiply(tmpColour.setRGB(pixels.data[o]! / 255, pixels.data[o + 1]! / 255, pixels.data[o + 2]! / 255, THREE.SRGBColorSpace));
      }
      if (!glows) grade(c);
      colours[i * 3] = c.r;
      colours[i * 3 + 1] = c.g;
      colours[i * 3 + 2] = c.b;
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


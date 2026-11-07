// Explicit extension so the node test runner can load this directly.
import { TERRAIN_DETAIL, type TerrainDetail } from "./terrain-material.ts";

/**
 * What "low" and "high" actually mean.
 *
 * These numbers used to live as inline ternaries at eight call sites across the
 * scene — `quality === "low" ? 280 : 720` here, `low ? 0.16 : 0.1` there. Two
 * problems with that. Nothing told you what the mobile tier costs without
 * reading the whole file, and nothing stopped a new mobile setting from being
 * *more* expensive than its desktop counterpart, which is how a quality tier
 * quietly stops being one.
 *
 * Gathered here, the tier is one object and [quality.test.ts](./quality.test.ts)
 * can assert that every axis which costs GPU time is no larger on low than on
 * high — plus the two places where the inversion is deliberate.
 */
export type QualityTier = {
  /** Procedural ground detail. See terrain-material.ts. */
  terrain: TerrainDetail;
  /** Instanced scatter counts. */
  trees: number;
  rocks: number;
  /** Device pixel ratio ceiling handed to the renderer. */
  dpr: [number, number];
  /** Shadow maps, and the MSAA that goes with them. */
  shadows: boolean;
  antialias: boolean;
  /** ACES exposure. */
  exposure: number;
  /** Fill light. */
  hemisphere: number;
  ambient: number;
  /** Multiplier on the sun, compensating for the missing shadows. */
  sunBoost: number;
  /** Aerial perspective ramp, in world units. */
  fogNear: number;
  fogFar: number;
  /**
   * Opening camera and the point it orbits. Both lie on the line from the
   * Matterhorn through the village: the camera stands back behind the village
   * (just short of the rim the DEM raises along the map edge), the target sits
   * on the slopes above it. The village lands in the lower third and the summit just under
   * the top edge, with sky above it.
   *
   * A phone in portrait has the HUD over its lower half, so it centres on
   * the village itself, a little steeper (about 40 degrees), and leaves the
   * peaks for the top of the screen.
   *
   * The desktop pitch, about 31 degrees with a wide-ish lens, is a compromise forced by geometry: at 50
   * degrees or more the top of the frame is still on the ground and the peaks
   * fall out of shot, which is exactly the flat grey sheet this replaced.
   */
  cameraAt: [number, number, number];
  cameraTarget: [number, number, number];
  fov: number;
  /** Trees per scatter point: forest grows in stands, not singles. */
  treesPerClump: number;
  /**
   * Frame time above which the renderer drops its pixel ratio a step, and
   * below which it climbs back. See AdaptiveResolution in SkiScene.
   */
  slowFrameMs: number;
  /** Peak labels drop their altitude on a narrow screen. */
  compactLabels: boolean;
};

export const QUALITY: Record<"low" | "high", QualityTier> = {
  low: {
    terrain: TERRAIN_DETAIL.low,
    trees: 280,
    rocks: 80,
    dpr: [1, 1.25],
    shadows: false,
    antialias: false,
    // Brighter than desktop on purpose: with no shadow map there is nothing
    // darkening the ground, so matching desktop's exposure renders flat.
    exposure: 1.1,
    hemisphere: 0.56,
    ambient: 0.16,
    sunBoost: 1.12,
    // A shorter ramp means less distant geometry contributing anything worth
    // drawing, and the horizon lands sooner on a small screen anyway.
    fogNear: 30,
    fogFar: 600,
    cameraAt: [25, 66, 109],
    cameraTarget: [-4, 3, 40],
    fov: 60,
    treesPerClump: 2,
    slowFrameMs: 24,
    compactLabels: true,
  },
  high: {
    terrain: TERRAIN_DETAIL.high,
    trees: 600,
    rocks: 180,
    dpr: [1, 1.7],
    shadows: true,
    antialias: true,
    exposure: 0.98,
    hemisphere: 0.44,
    ambient: 0.1,
    sunBoost: 1,
    fogNear: 40,
    fogFar: 720,
    cameraAt: [30, 88, 110],
    cameraTarget: [-23.1, 10, -8.5],
    fov: 55,
    treesPerClump: 3,
    slowFrameMs: 22,
    compactLabels: false,
  },
};

export const HEX_SIZE = 2.85;
const SQRT3 = Math.sqrt(3);

export interface Axial {
  q: number;
  r: number;
}

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function hexToWorld(q: number, r: number, size = HEX_SIZE): { x: number; z: number } {
  const x = size * (SQRT3 * q + (SQRT3 / 2) * r);
  const z = size * (1.5 * r);
  return { x, z };
}

export function worldToHex(x: number, z: number, size = HEX_SIZE): Axial {
  const q = ((SQRT3 / 3) * x - (1 / 3) * z) / size;
  const r = ((2 / 3) * z) / size;
  return cubeRound(q, r);
}

function cubeRound(fracQ: number, fracR: number): Axial {
  const fracS = -fracQ - fracR;
  let q = Math.round(fracQ);
  let r = Math.round(fracR);
  const s = Math.round(fracS);
  const dq = Math.abs(q - fracQ);
  const dr = Math.abs(r - fracR);
  const ds = Math.abs(s - fracS);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

export function hexDistance(a: Axial, b: Axial): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export const HEX_DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexesInRange(center: Axial, radius: number): Axial[] {
  const out: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) out.push({ q: center.q + q, r: center.r + r });
  }
  return out;
}

export function hexLine(a: Axial, b: Axial): Axial[] {
  const n = hexDistance(a, b);
  if (n === 0) return [{ ...a }];
  const out: Axial[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(cubeRound(a.q * (1 - t) + b.q * t, a.r * (1 - t) + b.r * t));
  }
  return out;
}

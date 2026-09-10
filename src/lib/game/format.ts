const de = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
const de1 = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 });

export function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${de1.format(n / 1_000_000)} Mio`;
  if (Math.abs(n) >= 10_000) return de.format(Math.round(n));
  return de.format(Math.round(n));
}

export function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return de.format(Math.round(n));
}

export function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
}

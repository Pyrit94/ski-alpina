const de = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
const de1 = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 });

export function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${de1.format(n / 1_000_000)} Mio`;
  if (Math.abs(n) >= 10_000) return de.format(Math.round(n));
  return de.format(Math.round(n));
}

/** Short form for tight spots: 950, 12.5k, 1.2 Mio. Swiss grouping below 10'000. */
export function fmtCompact(n: number) {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}${de1.format(a / 1_000_000)} Mio`;
  if (a >= 10_000) return `${sign}${de1.format(a / 1000)}k`;
  return `${sign}${de.format(Math.round(a))}`;
}

/** Signed money: +1'200 or −800. */
export function fmtSigned(n: number) {
  return `${n < 0 ? "−" : "+"}${fmt(Math.abs(n))}`;
}

export function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
}

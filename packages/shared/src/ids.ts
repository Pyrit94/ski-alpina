export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36).slice(-5);
  return `${prefix}_${t}${rand}`;
}

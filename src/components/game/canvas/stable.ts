/**
 * Keep the previous value when the new one has the same content.
 *
 * Every server snapshot (1 Hz) arrives as freshly parsed JSON, so `buildings`,
 * `lifts` and `pistes` are new arrays every second even when nothing on the
 * mountain changed. Anything memoised on them — the ground mesh's heat map,
 * the cable tubes, the piste ribbons — was thrown away and rebuilt once a
 * second. Comparing by content and handing back the old reference keeps those
 * memos alive until something visible actually changes.
 *
 * JSON is a fair signature here: these are plain records of a few hundred
 * bytes each, serialised in the same key order by the same server.
 */
export function keepIfSame<T>(prev: { value: T; sig: string } | null, next: T): { value: T; sig: string } {
  if (prev && prev.value === next) return prev;
  const sig = JSON.stringify(next);
  if (prev && prev.sig === sig) return prev;
  return { value: next, sig };
}

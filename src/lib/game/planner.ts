import { useCallback, useEffect, useId, useSyncExternalStore, type DependencyList } from "react";
import { demFor, runPlannerJob, type JobOf, type PlannerJob, type PlannerKind, type PlannerReply, type PlannerRequest, type PlannerResults } from "./planner-jobs.ts";

/**
 * The HUD's planners run the simulation dozens of times; on a phone that
 * froze the screen for a quarter of a second whenever a panel opened. Here
 * they go to a worker, one per page, and the panel shows «Rechne…» until the
 * answer is back. Without workers (server rendering, tests, an old browser,
 * a worker that failed to load) the job runs here, a tick later.
 */

interface Pending {
  channel: string;
  job: PlannerJob;
  resolve: (result: PlannerResults[PlannerKind] | null) => void;
  reject: (err: Error) => void;
}

const pending = new Map<number, Pending>();
/** Each channel's newest request: answers to older ones are dropped. */
const newest = new Map<string, number>();
let nextId = 1;
/** undefined: not started yet; null: none to be had, work here. */
let worker: Worker | null | undefined;

function runHere(id: number) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  try {
    p.resolve(runPlannerJob(p.job, demFor(p.job.state)));
  } catch (err) {
    p.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

function settle(reply: PlannerReply) {
  const p = pending.get(reply.id);
  if (!p) return;
  pending.delete(reply.id);
  if ("superseded" in reply) p.resolve(null);
  else if (reply.ok) p.resolve(reply.result);
  else p.reject(new Error(reply.error));
}

function plannerWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === "undefined") return (worker = null);
  try {
    const w = new Worker(new URL("./planner.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<PlannerReply>) => settle(e.data);
    w.onerror = (e) => {
      // It did not load or it crashed: everything still open is worked out here.
      e.preventDefault();
      console.warn("Planer-Worker ausgefallen, rechne im Hauptthread:", e.message);
      w.terminate();
      worker = null;
      for (const id of [...pending.keys()]) setTimeout(() => runHere(id), 0);
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Work a job out, off the main thread where possible. A newer request on the
 * same channel supersedes this one: it then resolves with null.
 */
export function requestPlan<K extends PlannerKind>(channel: string, job: JobOf<K>): Promise<PlannerResults[K] | null> {
  const id = nextId++;
  dropRequest(channel);
  newest.set(channel, id);
  return new Promise<PlannerResults[K] | null>((resolve, reject) => {
    pending.set(id, { channel, job, resolve: resolve as Pending["resolve"], reject });
    const w = plannerWorker();
    if (w) {
      try {
        w.postMessage({ id, channel, job } satisfies PlannerRequest);
        return;
      } catch {
        // Not cloneable after all: work it out here.
      }
    }
    setTimeout(() => runHere(id), 0);
  });
}

/** Forget a channel's open request; its promise resolves with null. */
export function dropRequest(channel: string) {
  const id = newest.get(channel);
  if (id === undefined) return;
  newest.delete(channel);
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  p.resolve(null);
}

export interface PlannerView<T> {
  /** The latest answer; kept while a newer request is worked out. */
  result: T | null;
  /** A request is out. */
  busy: boolean;
}

const IDLE: PlannerView<never> = { result: null, busy: false };
const views = new Map<string, PlannerView<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function setView(channel: string, view: PlannerView<unknown> | null) {
  if (view) views.set(channel, view);
  else views.delete(channel);
  for (const l of listeners.get(channel) ?? []) l();
}

function subscribe(channel: string, l: () => void) {
  let set = listeners.get(channel);
  if (!set) listeners.set(channel, (set = new Set()));
  set.add(l);
  return () => {
    set.delete(l);
    if (set.size === 0) listeners.delete(channel);
  };
}

function ask<K extends PlannerKind>(channel: string, job: JobOf<K> | null) {
  if (!job) {
    dropRequest(channel);
    if (views.has(channel)) setView(channel, null);
    return;
  }
  const was = views.get(channel) ?? IDLE;
  if (!was.busy) setView(channel, { result: was.result, busy: true });
  requestPlan(channel, job).then(
    (result) => {
      if (result !== null) setView(channel, { result, busy: false });
    },
    (err: unknown) => {
      console.error("Planer:", err);
      setView(channel, { result: views.get(channel)?.result ?? null, busy: false });
    },
  );
}

/**
 * A planner's answer for a panel: `make` builds the job (null: nothing to
 * plan, e.g. the panel is closed) and runs again when `deps` change. Stale
 * answers never land; the last good one stays shown while the next is worked out.
 */
export function usePlanner<K extends PlannerKind>(make: () => JobOf<K> | null, deps: DependencyList): PlannerView<PlannerResults[K]> {
  const channel = useId();
  useEffect(
    () => ask(channel, make()),
    // The caller names what the job depends on, as with useMemo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channel, ...deps],
  );
  useEffect(() => () => ask(channel, null), [channel]);
  const listen = useCallback((l: () => void) => subscribe(channel, l), [channel]);
  return useSyncExternalStore(
    listen,
    () => (views.get(channel) ?? IDLE) as PlannerView<PlannerResults[K]>,
    () => IDLE,
  );
}

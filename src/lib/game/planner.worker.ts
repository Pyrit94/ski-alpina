import { loadDemFor, runPlannerJob, type PlannerReply, type PlannerRequest } from "./planner-jobs.ts";

/**
 * The planners, off the main thread. One request per channel (a panel) is
 * worth working out: when a newer one arrives while an older one still
 * waits in line, the older one is answered as superseded without running.
 */

/** What of the worker's global scope this file uses (the DOM lib types `self` as a window). */
interface WorkerScope {
  onmessage: ((e: MessageEvent<PlannerRequest>) => void) | null;
  postMessage: (reply: PlannerReply) => void;
}

const scope = self as unknown as WorkerScope;
const waiting = new Map<string, PlannerRequest>();
let running = false;

scope.onmessage = (e: MessageEvent<PlannerRequest>) => {
  const req = e.data;
  const older = waiting.get(req.channel);
  if (older) scope.postMessage({ id: older.id, superseded: true } satisfies PlannerReply);
  waiting.set(req.channel, req);
  if (!running) void drain();
};

async function drain() {
  running = true;
  try {
    while (waiting.size > 0) {
      const [channel, req] = waiting.entries().next().value!;
      waiting.delete(channel);
      try {
        const dem = await loadDemFor(req.job.state);
        const result = runPlannerJob(req.job, dem);
        scope.postMessage({ id: req.id, ok: true, result } satisfies PlannerReply);
      } catch (err) {
        scope.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies PlannerReply);
      }
      // Let newer requests arrive before the next one is picked.
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    running = false;
  }
}

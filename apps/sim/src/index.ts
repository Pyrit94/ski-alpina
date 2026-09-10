import { ECONOMY } from "../../../packages/config/src/economy.ts";

/**
 * Dedicated sim worker. When REDIS_URL is set, this process can be scaled
 * independently (BullMQ). Without Redis it no-ops — the API/hub ticks in-process.
 */
const redisUrl = process.env.REDIS_URL;

async function main() {
  if (!redisUrl) {
    console.info("[sim] REDIS_URL unset — in-process tick on API is authoritative");
    await new Promise(() => {
      /* keep process alive for docker */
    });
    return;
  }
  const { Worker } = await import("bullmq");
  const { default: Redis } = await import("ioredis");
  const connection = new Redis(redisUrl);
  new Worker(
    "ski-sim",
    async () => {
      /* rooms live in API memory; this worker is the Coolify scale-out hook */
      return { ok: true, at: Date.now() };
    },
    { connection, concurrency: 1 },
  );
  console.info("[sim] bullmq worker up, tick", ECONOMY.simTickMs);
}

void main();

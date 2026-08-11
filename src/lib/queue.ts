import { Queue } from "bullmq";
import IORedis from "ioredis";

export const QUEUE_NAMES = {
  scrape: "scrape",
  emailSync: "email-sync",
  digest: "digest",
  whatsapp: "whatsapp-control",
} as const;

let connection: IORedis | null = null;

export function redisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: redisConnection() });
    queues.set(name, q);
  }
  return q;
}

/** Enqueue a one-off run (used by the "Run now" buttons in the dashboard). */
export async function enqueueNow(name: string, payload: Record<string, unknown> = {}) {
  await getQueue(name).add("manual", payload, {
    removeOnComplete: 100,
    removeOnFail: 100,
  });
}

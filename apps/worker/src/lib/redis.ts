import { Redis } from "ioredis";
import { loadEnv } from "@audio/config";

/** BullMQ requires maxRetriesPerRequest = null for a worker's connection. */
export function createRedis(): Redis {
  return new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null });
}

export const connection = createRedis();

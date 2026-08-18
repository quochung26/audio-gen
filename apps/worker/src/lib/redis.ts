import { Redis } from "ioredis";
import { loadEnv } from "@audio/config";

/** BullMQ yêu cầu maxRetriesPerRequest = null cho kết nối của worker. */
export function createRedis(): Redis {
  return new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null });
}

export const connection = createRedis();

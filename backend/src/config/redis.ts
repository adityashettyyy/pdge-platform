import Redis from "ioredis";
import type { ConnectionOptions } from "bullmq";
import { URL } from "url";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const bullMQConnection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
export const redisCache = new Redis(REDIS_URL);

bullMQConnection.on("error", (e) => console.error("[Redis] BullMQ:", e.message));
bullMQConnection.on("connect", () => console.log("[Redis] BullMQ connected"));
redisCache.on("connect", () => console.log("[Redis] Cache connected"));

function parseUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  const o: ConnectionOptions = {
    host: u.hostname || "localhost",
    port: parseInt(u.port || "6379", 10),
  };
  if (u.password) o.password = u.password;
  return o;
}

export const redisConnection: ConnectionOptions = parseUrl(REDIS_URL);
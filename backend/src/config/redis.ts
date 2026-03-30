// src/config/redis.ts
// BullMQ + cache Redis connections.
// Reads REDIS_URL (full connection string) — NOT separate HOST/PORT vars.
// Example: redis://localhost:6379  or  redis://:password@host:6379

import Redis from "ioredis";
import { ConnectionOptions } from "bullmq";

// Parse REDIS_URL into BullMQ ConnectionOptions (for programmatic options if needed)
function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  const opts: ConnectionOptions = {
    host: u.hostname || "localhost",
    port: parseInt(u.port || "6379", 10),
  };
  if (u.password) opts.password = u.password;
  if (u.username && u.username !== "default") opts.username = u.username;
  return opts;
}

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Shared BullMQ Redis connection object (used by workers/queues/shutdown)
export const bullMQConnection = new Redis(REDIS_URL);

// Cache Redis client (used by Redis cache checks/operations)
export const redisCache = new Redis(REDIS_URL);

bullMQConnection.on("error", (err: Error) =>
  console.error("[Redis] BullMQ connection error:", err)
);
bullMQConnection.on("connect", () =>
  console.log("[Redis] BullMQ connected")
);

redisCache.on("error", (err: Error) =>
  console.error("[Redis] Cache connection error:", err)
);
redisCache.on("connect", () =>
  console.log("[Redis] Cache connected")
);

export async function connectRedis(): Promise<void> {
  await Promise.all([bullMQConnection.connect(), redisCache.connect()]);
}

export const redisConnection: ConnectionOptions = parseRedisUrl(REDIS_URL);
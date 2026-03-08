// src/config/redis.ts
// Redis client for BullMQ queues AND hot-path cache.

import Redis from 'ioredis'

// BullMQ connection — dedicated, never used for anything else
export const bullMQConnection = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,   // REQUIRED for BullMQ
  enableReadyCheck: false,      // REQUIRED for BullMQ
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
})

// General app cache — for twin state, sessions, etc.
export const redisCache = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
})

// Cache keys — centralized so you never typo a key
export const CACHE_KEYS = {
  TWIN_SNAPSHOT: (orgId: string) => `twin:snapshot:${orgId}`,
  GRAPH_NODES:   (orgId: string) => `graph:nodes:${orgId}`,
  GRAPH_EDGES:   (orgId: string) => `graph:edges:${orgId}`,
  INCIDENT:      (id: string)    => `incident:${id}`,
  SIM_RESULT:    (id: string)    => `sim:result:${id}`,
} as const

export const CACHE_TTL = {
  TWIN_SNAPSHOT: 30,
  GRAPH_NODES:   300,
  GRAPH_EDGES:   60,
  INCIDENT:      120,
  SIM_RESULT:    600,
} as const

bullMQConnection.on('error', (err: Error) => {
  console.error('[Redis BullMQ] Connection error:', err.message)
})

redisCache.on('error', (err: Error) => {
  console.error('[Redis Cache] Connection error:', err.message)
})
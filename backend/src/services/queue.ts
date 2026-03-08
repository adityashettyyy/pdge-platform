// src/services/queue.ts
// BullMQ job queue — Command Pattern.
//
// Every async operation is a Command pushed into a Redis-backed queue.
// Workers process commands independently of the HTTP request lifecycle.
// This means: POST /api/incidents/report returns in <50ms always.
// The trust score computation happens in the background.
//
// Queue architecture:
//   trust-score  → TrustScoreWorker  → processes reports, updates DB
//   simulation   → SimulationWorker  → calls Python microservice
//   allocation   → AllocationWorker  → runs OR-Tools (via Python)
//   sitrep       → SitrepWorker      → calls Claude API
//
// HOW TO TEST STANDALONE:
//   npx ts-node src/services/__tests__/queue.test.ts

import { Queue, Worker, Job, QueueEvents } from "bullmq";
import { bullMQConnection } from "../config/redis";
import {
  QUEUE_NAMES,
  TrustScoreJobPayload,
  SimulationJobPayload,
  AllocationJobPayload,
  SitrepJobPayload,
} from "../types";

// ─────────────────────────────────────────────────────────
// QUEUES — producers push jobs here
// ─────────────────────────────────────────────────────────

export const trustScoreQueue = new Queue<TrustScoreJobPayload>(
  QUEUE_NAMES.TRUST_SCORE,
  {
    connection: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
    defaultJobOptions: {
      attempts: 3, // retry failed jobs 3 times
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 100 }, // keep last 100 completed jobs
      removeOnFail: { count: 50 },
    },
  },
);

export const simulationQueue = new Queue<SimulationJobPayload>(
  QUEUE_NAMES.SIMULATION,
  {
    connection: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  },
);

export const allocationQueue = new Queue<AllocationJobPayload>(
  QUEUE_NAMES.ALLOCATION,
  {
    connection: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "fixed", delay: 5000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    },
  },
);

export const sitrepQueue = new Queue<SitrepJobPayload>(QUEUE_NAMES.SITREP, {
  connection: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

// ─────────────────────────────────────────────────────────
// JOB PRODUCERS — call these from your services/controllers
// ─────────────────────────────────────────────────────────

export const queueService = {
  // Queue a trust score computation after a new report arrives
  async enqueueTrustScore(payload: TrustScoreJobPayload): Promise<string> {
    const job = await trustScoreQueue.add(
      "process-report",
      payload,
      { priority: 1 }, // trust score is high priority — gates everything
    );
    console.log(
      `[Queue] TrustScore job queued: ${job.id} for incident ${payload.incidentId}`,
    );
    return job.id!;
  },

  // Queue a BFS spread simulation (triggered when trust score verified)
  async enqueueSimulation(payload: SimulationJobPayload): Promise<string> {
    const job = await simulationQueue.add("run-simulation", payload, {
      priority: 1,
    });
    console.log(
      `[Queue] Simulation job queued: ${job.id} for incident ${payload.incidentId}`,
    );
    return job.id!;
  },

  // Queue an allocation run (triggered after simulation completes)
  async enqueueAllocation(payload: AllocationJobPayload): Promise<string> {
    const job = await allocationQueue.add("run-allocation", payload);
    console.log(`[Queue] Allocation job queued: ${job.id}`);
    return job.id!;
  },

  // Queue a sitrep generation (triggered after allocation)
  async enqueueSitrep(payload: SitrepJobPayload): Promise<string> {
    const job = await sitrepQueue.add(
      "generate-sitrep",
      payload,
      { delay: 500 }, // small delay to ensure allocation plan is saved
    );
    console.log(`[Queue] Sitrep job queued: ${job.id}`);
    return job.id!;
  },

  // Get job status — useful for polling from frontend
  async getJobStatus(queueName: string, jobId: string) {
    const queueMap: Record<string, Queue> = {
      [QUEUE_NAMES.TRUST_SCORE]: trustScoreQueue,
      [QUEUE_NAMES.SIMULATION]: simulationQueue,
      [QUEUE_NAMES.ALLOCATION]: allocationQueue,
      [QUEUE_NAMES.SITREP]: sitrepQueue,
    };
    const queue = queueMap[queueName];
    if (!queue) throw new Error(`Unknown queue: ${queueName}`);
    const job = await queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    return { id: job.id, state, data: job.data, returnvalue: job.returnvalue };
  },

  // Graceful shutdown — drain queues before process exits
  async shutdown(): Promise<void> {
    await Promise.all([
      trustScoreQueue.close(),
      simulationQueue.close(),
      allocationQueue.close(),
      sitrepQueue.close(),
    ]);
    console.log("[Queue] All queues closed gracefully");
  },
};

// src/workers/trust-score.worker.ts
// The TrustScore worker — runs in the background, processing queue jobs.
//
// ARCHITECTURE:
//   HTTP Request → enqueue job → return 202 immediately
//   Worker picks up job → calls trustScoreService.processReport()
//   If verified → enqueue simulation job → chain continues
//
// This file is started separately from your main Express server.
// In development: ts-node src/workers/trust-score.worker.ts
// In production: PM2 or Docker runs it as a separate process.

import { Worker, Job } from "bullmq";
import { bullMQConnection } from "../config/redis";
import { trustScoreService } from "../services/trust-score";
import { queueService } from "../services/queue";
import { QUEUE_NAMES, TrustScoreJobPayload } from "../types";
import { prisma } from "../config/db";

console.log("[Worker] TrustScore worker starting...");

const worker = new Worker<TrustScoreJobPayload>(
  QUEUE_NAMES.TRUST_SCORE,
  async (job: Job<TrustScoreJobPayload>) => {
    const { incidentId, organizationId, reportData } = job.data;

    console.log(
      `[Worker] Processing trust score job ${job.id} for incident ${incidentId}`,
    );

    // Step 1: Process the report through TrustScoreService
    const result = await trustScoreService.processReport(reportData);

    console.log(
      `[Worker] Trust score computed: ${result.score.toFixed(1)} | ` +
        `Verdict: ${result.verdict}`,
    );

    // Step 2: If verified, trigger the simulation pipeline
    if (result.isVerified) {
      console.log(
        `[Worker] Incident ${incidentId} VERIFIED — triggering simulation...`,
      );

      // Get the origin node from the incident
      const incident = await prisma.incident.findUnique({
        where: { id: incidentId },
        select: { originNodeId: true, type: true },
      });

      if (incident?.originNodeId) {
        // Enqueue simulation — this is Step 4 of the closed loop
        await queueService.enqueueSimulation({
          incidentId,
          originNodeId: incident.originNodeId,
          disasterType: incident.type,
          organizationId,
        });
      } else {
        console.warn(
          `[Worker] Incident ${incidentId} has no originNodeId — simulation skipped`,
        );
      }
    }

    // Return result so it's stored in BullMQ job.returnvalue
    return result;
  },
  {
    connection: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
    concurrency: 5, // process up to 5 trust score jobs simultaneously
    limiter: {
      max: 100, // max 100 jobs per 10 seconds
      duration: 10000,
    },
  },
);

// Event handlers — crucial for observability
worker.on("completed", (job, result) => {
  console.log(
    `[Worker] Job ${job.id} completed | Score: ${result.score} | Verdict: ${result.verdict}`,
  );
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  // In production: send to Sentry or PagerDuty here
});

worker.on("error", (err) => {
  console.error("[Worker] Worker error:", err);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Worker] SIGTERM received — closing gracefully...");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await worker.close();
  process.exit(0);
});

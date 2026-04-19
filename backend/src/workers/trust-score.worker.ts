import "dotenv/config";
import { Worker, Job } from "bullmq";
import { bullMQConnection } from "../config/redis";
import { trustScoreService } from "../services/trust-score.service";
import { queueService } from "../services/queue.service";
import { QUEUE_NAMES, TrustScoreJobPayload } from "../types";
import { prisma } from "../config/db";

console.log("[TrustWorker] Starting...");

bullMQConnection.on("ready", () => console.log("[TrustWorker] Redis ready"));
bullMQConnection.on("error", (e: Error) => console.error("[TrustWorker] Redis error:", e.message));

const worker = new Worker<TrustScoreJobPayload>(
  QUEUE_NAMES.TRUST_SCORE,
  async (job: Job<TrustScoreJobPayload>) => {
    const { incidentId, organizationId, reportData } = job.data;
    console.log(`[TrustWorker] Processing job ${job.id} | incident ${incidentId}`);

    const result = await trustScoreService.processReport(reportData);
    console.log(`[TrustWorker] Score: ${result.score.toFixed(1)} | ${result.verdict}`);

    if (result.isVerified) {
      console.log(`[TrustWorker] VERIFIED — queueing simulation`);
      const inc = await prisma.incident.findUnique({
        where: { id: incidentId },
        select: { originNodeId: true, type: true },
      });
      if (inc?.originNodeId) {
        await queueService.enqueueSimulation({
          incidentId,
          organizationId,
          originNodeId: inc.originNodeId,
          disasterType: inc.type,
        });
      } else {
        console.warn(`[TrustWorker] No originNodeId on incident ${incidentId} — simulation skipped`);
      }
    }

    return result;
  },
  {
    connection: bullMQConnection,
    concurrency: 5,
  }
);

worker.on("completed", (job, r) =>
  console.log(`[TrustWorker] Job ${job.id} done | Score: ${r.score} | ${r.verdict}`)
);
worker.on("failed", (job, err) =>
  console.error(`[TrustWorker] Job ${job?.id} FAILED:`, err.message)
);
worker.on("error", (err) =>
  console.error("[TrustWorker] Worker error:", err.message)
);
worker.on("ready", () => console.log("[TrustWorker] Ready"));

process.on("SIGTERM", async () => { await worker.close(); process.exit(0); });
process.on("SIGINT",  async () => { await worker.close(); process.exit(0); });
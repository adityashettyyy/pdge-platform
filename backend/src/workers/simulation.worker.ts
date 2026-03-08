// src/workers/simulation.worker.ts
// Simulation worker — picks up simulation jobs from BullMQ and drives the
// Python optimization microservice pipeline.
//
// Run alongside the main server:
//   npm run worker:simulation

import { Worker, Job } from "bullmq";
import { bullMQConnection } from "../config/redis";
import { simulationService } from "../services/simulation.service";
import { QUEUE_NAMES, SimulationJobPayload } from "../types";

console.log("[Worker] Simulation worker starting...");

const worker = new Worker<SimulationJobPayload>(
  QUEUE_NAMES.SIMULATION,
  async (job: Job<SimulationJobPayload>) => {
    const { incidentId, organizationId, originNodeId, disasterType } = job.data;

    console.log(`\n[Worker] Processing simulation job ${job.id}`);
    console.log(
      `[Worker] Incident: ${incidentId} | Origin: ${originNodeId} | Type: ${disasterType}`,
    );

    // Check Python service is up before starting
    const healthy = await simulationService.checkHealth();
    if (!healthy) {
      throw new Error(
        "Python optimization service is not reachable. Is it running on port 8000?",
      );
    }

    // Run the full pipeline: simulate → allocate → queue sitrep
    await simulationService.runPipeline(
      incidentId,
      organizationId,
      originNodeId,
      disasterType as any,
    );

    return { incidentId, status: "PIPELINE_COMPLETE" };
  },
  {
    connection: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
    concurrency: 2, // max 2 simulations at once (Python is CPU-bound)
  },
);

worker.on("completed", (job, result) => {
  console.log(`[Worker] Simulation job ${job.id} complete:`, result);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Simulation job ${job?.id} FAILED:`, err.message);
  // In production: alert on-call engineer here
});

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
process.on("SIGINT", async () => {
  await worker.close();
  process.exit(0);
});

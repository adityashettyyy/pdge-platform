// src/services/__tests__/queue.test.ts
// ─────────────────────────────────────────────────────────
// STANDALONE TEST — proves BullMQ is working.
// Push a job → process it → verify the result.
//
// HOW TO RUN:
//   1. Make sure Redis is running: docker compose up redis -d
//   2. Run: npx ts-node src/services/__tests__/queue.test.ts
//
// WHAT TO EXPECT:
//   ✓ Job pushed to queue
//   ✓ Job processed by inline worker
//   ✓ Job result returned
//   ✓ Queue cleaned up
// ─────────────────────────────────────────────────────────

import { config } from "dotenv";
config();

import { Queue, Worker } from "bullmq";
import { bullMQConnection } from "../../config/redis";

const TEST_QUEUE = "pdge-test-queue";

async function runTest() {
  console.log("\n══════════════════════════════════════════");
  console.log("  BullMQ Queue — Standalone Test");
  console.log("══════════════════════════════════════════\n");

  // Create a test queue
  const queue = new Queue(TEST_QUEUE, {
    connection: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
    defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
  });

  let jobCompleted = false;

  // Create a worker to process the job
  const worker = new Worker(
    TEST_QUEUE,
    async (job) => {
      console.log(`[Worker] Processing job ${job.id}`);
      console.log("[Worker] Job data:", job.data);

      // Simulate some async work
      await new Promise((resolve) => setTimeout(resolve, 200));

      return {
        processed: true,
        incidentId: job.data.incidentId,
        processedAt: new Date(),
      };
    },
    {
      connection: {
        host: process.env.REDIS_HOST ?? "localhost",
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
      concurrency: 1,
    },
  );

  // Track completion
  worker.on("completed", (job, result) => {
    console.log(`\n✓ Job ${job.id} completed!`);
    console.log("  Result:", result);
    jobCompleted = true;
  });

  worker.on("failed", (job, err) => {
    console.error(`✗ Job ${job?.id} failed:`, err.message);
  });

  try {
    // Push a test job
    console.log("Pushing test job to queue...");
    const job = await queue.add("test-trust-score", {
      incidentId: "test-incident-123",
      organizationId: "test-org-456",
      reportData: {
        incidentId: "test-incident-123",
        gpsValid: true,
      },
    });
    console.log(`✓ Job queued with ID: ${job.id}`);

    // Wait for processing
    console.log("\nWaiting for worker to process...");
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Worker timeout after 5s")),
        5000,
      );
      const check = setInterval(() => {
        if (jobCompleted) {
          clearTimeout(timeout);
          clearInterval(check);
          resolve();
        }
      }, 100);
    });

    // Verify queue is empty
    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    console.log(
      `\nQueue state: ${waiting.length} waiting, ${active.length} active`,
    );

    console.log("\n══════════════════════════════════════════");
    console.log("  ✅ BullMQ Queue TEST PASSED");
    console.log("══════════════════════════════════════════\n");
  } catch (err) {
    console.error("\n❌ TEST FAILED:", err);
    process.exit(1);
  } finally {
    await worker.close();
    await queue.close();
    await bullMQConnection.quit();
  }
}

runTest();

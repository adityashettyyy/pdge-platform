import { Queue } from "bullmq";
import { bullMQConnection } from "../config/redis";
import { QUEUE_NAMES, TrustScoreJobPayload, SimulationJobPayload } from "../types";

const trustQueue = new Queue<TrustScoreJobPayload>(QUEUE_NAMES.TRUST_SCORE, { connection: bullMQConnection });
const simQueue = new Queue<SimulationJobPayload>(QUEUE_NAMES.SIMULATION, { connection: bullMQConnection });
const closeQueue = new Queue(QUEUE_NAMES.INCIDENT_CLOSE, { connection: bullMQConnection });

export const queueService = {
  enqueueTrustScore: (payload: TrustScoreJobPayload) =>
    trustQueue.add("process-report", payload, { attempts: 3, backoff: { type: "exponential", delay: 2000 } }),
  enqueueSimulation: (payload: SimulationJobPayload) =>
    simQueue.add("run-simulation", payload, { attempts: 2, backoff: { type: "fixed", delay: 5000 } }),
  enqueueClose: (incidentId: string) =>
    closeQueue.add("postmortem", { incidentId }, { delay: 2000 }),
  shutdown: async () => { await Promise.all([trustQueue.close(), simQueue.close(), closeQueue.close()]); },
};

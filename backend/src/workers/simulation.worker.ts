// src/workers/simulation.worker.ts
// BullMQ simulation worker — the end-to-end pipeline runner.
//
// TRIGGERED BY: trust-score.worker.ts when incident trustScore >= 70 (VERIFIED)
//               queues a job on the "simulation" queue.
//
// PIPELINE:
//   1. Load incident + graph nodes/edges + idle resources from DB
//   2. Create SimulationResult row (status=RUNNING)
//   3. POST to Python /simulate → BFS risk maps + highRiskNodes
//   4. Save SimulationResult (COMPLETED) with all three forecast maps
//   5. Apply risk map to DigitalTwinService (writes to DB + emits WS events)
//   6. POST to Python /allocate → demand-driven assignment list
//   7. Save AllocationPlan + ResourceAssignment rows (status=PENDING_APPROVAL)
//   8. Update incident status → ACTIVE
//   9. Emit SIMULATION_COMPLETE WebSocket event
//  10. On incident CLOSE: PostMortemService runs via "incident-close" queue

import { Worker, Job, Queue } from "bullmq";
import { prisma } from "../config/db";
import { redisConnection } from "../config/redis";
import { digitalTwinService } from "../services/digital-twin.service";
import { postMortemService } from "../services/postmortem.service";
import {
  SimulationStatus, IncidentStatus, PlanStatus, ResourceStatus,
} from "@prisma/client";

const PYTHON_URL = process.env.PYTHON_SERVICE_URL ?? "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────────────

interface SimJobData {
  incidentId:     string;
  organizationId: string;
}

interface CloseJobData {
  incidentId: string;
}

// ── Helper: call Python with timeout + descriptive error ─────────────────────

async function callPython(
  endpoint: string,
  body: unknown,
  timeoutMs = 30_000,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${PYTHON_URL}${endpoint}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  ctrl.signal,
    });
  } catch (err: any) {
    throw new Error(
      `Python service unreachable at ${PYTHON_URL}${endpoint}: ${err.message}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Python ${endpoint} returned ${res.status}: ${text}`);
  }

  return res.json();
}

// ── Simulation worker ─────────────────────────────────────────────────────────

const simWorker = new Worker<SimJobData>(
  "simulation",
  async (job: Job<SimJobData>) => {
    const { incidentId, organizationId } = job.data;
    console.log(`[SimWorker] Job ${job.id} | incident ${incidentId}`);

    // ── 1. Load data ────────────────────────────────────────────────────
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found — aborting`);
    }

    const [nodes, edges, idleResources] = await Promise.all([
      prisma.graphNode.findMany({ where: { organizationId, isActive: true } }),
      prisma.graphEdge.findMany({ where: { organizationId } }),
      prisma.resource.findMany({
        where: { organizationId, isActive: true, status: ResourceStatus.IDLE },
      }),
    ]);

    if (nodes.length === 0) {
      throw new Error(`No active graph nodes found for org ${organizationId}`);
    }

    // Resolve originNodeId — fall back to first ZONE node if null
    const originNodeId: string =
      incident.originNodeId ??
      nodes.find(n => n.type === "ZONE")?.id ??
      nodes[0].id;

    // ── 2. Create SimulationResult (RUNNING) ────────────────────────────
    const simResult = await prisma.simulationResult.create({
      data: {
        incidentId,
        status:            SimulationStatus.RUNNING,
        disasterType:      incident.type,
        spreadCoefficient: 0.35,
        startedAt:         new Date(),
      },
    });

    // Shared graph payload (used for both /simulate and /allocate)
    const graphPayload = {
      organizationId,
      nodes: nodes.map(n => ({
        id:           n.id,
        label:        n.label,
        type:         n.type,
        latitude:     n.latitude,
        longitude:    n.longitude,
        capacity:     n.capacity,
        currentLoad:  n.currentLoad,
        population:   n.population,
        disasterRisk: n.disasterRisk,
      })),
      edges: edges.map(e => ({
        id:         e.id,
        fromNodeId: e.fromNodeId,
        toNodeId:   e.toNodeId,
        weight:     e.weight,
        status:     e.status,
        slowFactor: e.slowFactor,
      })),
    };

    // ── 3. Call Python /simulate ────────────────────────────────────────
    console.log(`[SimWorker] POST ${PYTHON_URL}/simulate`);
    const simData = await callPython("/simulate", {
      incidentId,
      organizationId,
      originNodeId,
      disasterType:      incident.type,
      ticks:             9,
      spreadCoefficient: 0.35,
      graph:             graphPayload,
    }) as any;

    // ── 4. Save SimulationResult (COMPLETED) ────────────────────────────
    await prisma.simulationResult.update({
      where: { id: simResult.id },
      data: {
        status:            SimulationStatus.COMPLETED,
        forecastT2h:       simData.forecastT2h,
        forecastT4h:       simData.forecastT4h,
        forecastT6h:       simData.forecastT6h,
        confidence:        simData.confidence,
        spreadCoefficient: simData.spreadCoefficient,
        algorithmUsed:     "BFS",
        completedAt:       new Date(),
      },
    });

    console.log(
      `[SimWorker] Simulation done | ` +
      `high-risk: ${simData.highRiskNodes?.length ?? 0} nodes | ` +
      `confidence: ${simData.confidence}`
    );

    // ── 5. Apply risk to digital twin ───────────────────────────────────
    await digitalTwinService.applySimulationResult(
      incidentId,
      simData.forecastT6h,   // final tick is the authoritative risk state
      simData.highRiskNodes ?? [],
    );

    // ── 6. Call Python /allocate ────────────────────────────────────────
    console.log(`[SimWorker] POST ${PYTHON_URL}/allocate`);
    const allocData = await callPython("/allocate", {
      incidentId,
      organizationId,
      simulationResultId: simResult.id,
      disasterType:       incident.type,
      trustScore:         incident.trustScore,
      graph:              graphPayload,
      resources: idleResources.map(r => ({
        id:              r.id,
        label:           r.label,
        type:            r.type,
        currentNodeId:   r.currentNodeId,
        capacity:        r.capacity,
        fuelLevel:       r.fuelLevel,
        fatigueLevel:    r.fatigueLevel,
        skillLevel:      r.skillLevel,
        geographicRange: r.geographicRange,
      })),
      riskMap:     simData.forecastT6h,
      forecastT2h: simData.forecastT2h,
      forecastT4h: simData.forecastT4h,
    }) as any;

    console.log(
      `[SimWorker] Allocation done | ` +
      `tier: ${allocData.severityTier} | ` +
      `assignments: ${allocData.totalResources} | ` +
      `shortfalls: ${JSON.stringify(allocData.shortfalls ?? {})}`
    );

    // ── 7. Persist AllocationPlan + ResourceAssignments ─────────────────
    const plan = await prisma.allocationPlan.create({
      data: {
        simulationResultId: simResult.id,
        status:             PlanStatus.PENDING_APPROVAL,
        strategyUsed:       allocData.strategyUsed ?? "DEMAND_DRIVEN",
        confidence:         allocData.confidence ?? 0,
        totalResources:     allocData.totalResources ?? 0,
        expiresAt:          new Date(Date.now() + (allocData.expiresInMinutes ?? 30) * 60_000),
        assignments: {
          create: (allocData.assignments ?? []).map((a: any) => ({
            resourceId:   a.resourceId,
            fromNodeId:   a.fromNodeId,
            toNodeId:     a.toNodeId,
            routeEdgeIds: [],
            etaMinutes:   a.etaMinutes ?? 0,
            priority:     a.priority ?? "NORMAL",
            confidence:   a.confidence ?? 0,
          })),
        },
      },
    });

    // ── 8. Update incident → ACTIVE ─────────────────────────────────────
    await prisma.incident.update({
      where: { id: incidentId },
      data:  { status: IncidentStatus.ACTIVE },
    });

    // ── 9. Broadcast SIMULATION_COMPLETE ────────────────────────────────
    digitalTwinService.emit("SIMULATION_COMPLETE", {
      incidentId,
      planId:         plan.id,
      severityTier:   allocData.severityTier,
      totalResources: allocData.totalResources,
      highRiskNodes:  simData.highRiskNodes,
      shortfalls:     allocData.shortfalls,
    });

    console.log(`[SimWorker] Job ${job.id} complete | plan: ${plan.id}`);
    return { planId: plan.id, severityTier: allocData.severityTier };
  },
  { connection: redisConnection, concurrency: 2 },
);

simWorker.on("failed", (job, err) => {
  console.error(`[SimWorker] Job ${job?.id} FAILED: ${err.message}`);
  if (job?.data?.incidentId) {
    prisma.simulationResult
      .updateMany({
        where: {
          incidentId: job.data.incidentId,
          status:     SimulationStatus.RUNNING,
        },
        data: { status: SimulationStatus.FAILED },
      })
      .catch(() => {});
  }
});

simWorker.on("ready", () =>
  console.log("[SimWorker] Simulation worker ready")
);

// ── PostMortem worker (incident-close queue) ──────────────────────────────────

const closeWorker = new Worker<CloseJobData>(
  "incident-close",
  async (job: Job<CloseJobData>) => {
    console.log(`[PostMortem] Running for incident ${job.data.incidentId}`);
    await postMortemService.run(job.data.incidentId);
  },
  { connection: redisConnection, concurrency: 1 },
);

closeWorker.on("failed", (job, err) =>
  console.error(`[PostMortem] Job ${job?.id} failed: ${err.message}`)
);

closeWorker.on("ready", () =>
  console.log("[PostMortem] Close/PostMortem worker ready")
);

export { simWorker, closeWorker };
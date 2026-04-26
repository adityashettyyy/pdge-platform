import "dotenv/config";
import { Worker, Job } from "bullmq";
import { bullMQConnection } from "../config/redis";
import { digitalTwinService } from "../services/digital-twin.service";
import { postMortemService } from "../services/postmortem.service";
import { prisma } from "../config/db";
import { QUEUE_NAMES, SimulationJobPayload } from "../types";
import { SimulationStatus, IncidentStatus, PlanStatus, ResourceStatus } from "@prisma/client";

const PYTHON = process.env.PYTHON_SERVICE_URL ?? "http://localhost:8000";
console.log("[SimWorker] Starting...");

async function callPython(endpoint: string, body: unknown, ms = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`${PYTHON}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!r.ok) throw new Error(`Python ${endpoint} ${r.status}: ${await r.text()}`);
    return r.json();
  } finally { clearTimeout(t); }
}

const simWorker = new Worker<SimulationJobPayload>(
  QUEUE_NAMES.SIMULATION,
  async (job: Job<SimulationJobPayload>) => {
    const { incidentId, organizationId, originNodeId, disasterType } = job.data;
    console.log(`[SimWorker] Job ${job.id} | ${incidentId}`);
    const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new Error(`Incident ${incidentId} not found`);
    const [nodes, edges, idle] = await Promise.all([
      prisma.graphNode.findMany({ where: { organizationId, isActive: true } }),
      prisma.graphEdge.findMany({ where: { organizationId } }),
      prisma.resource.findMany({ where: { organizationId, isActive: true, status: ResourceStatus.IDLE } }),
    ]);
    const sim = await prisma.simulationResult.create({ data: { incidentId, status: SimulationStatus.RUNNING, disasterType: incident.type, spreadCoefficient: 0.35, startedAt: new Date() } });
    const graphPayload = { organizationId, nodes: nodes.map(n => ({ id: n.id, label: n.label, type: n.type, latitude: n.latitude, longitude: n.longitude, capacity: n.capacity, currentLoad: n.currentLoad, population: n.population, disasterRisk: n.disasterRisk })), edges: edges.map(e => ({ id: e.id, fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, weight: e.weight, status: e.status, slowFactor: e.slowFactor })) };
    const simData = await callPython("/simulate", { incidentId, organizationId, originNodeId, disasterType, ticks: 9, spreadCoefficient: 0.35, graph: graphPayload }) as any;
    await prisma.simulationResult.update({ where: { id: sim.id }, data: { status: SimulationStatus.COMPLETED, forecastT2h: simData.forecastT2h, forecastT4h: simData.forecastT4h, forecastT6h: simData.forecastT6h, confidence: simData.confidence, spreadCoefficient: simData.spreadCoefficient, algorithmUsed: "BFS", completedAt: new Date() } });
    await digitalTwinService.applySimulationResult(incidentId, simData.forecastT6h, simData.highRiskNodes ?? []);
    const allocData = await callPython("/allocate", { incidentId, organizationId, simulationResultId: sim.id, disasterType, trustScore: incident.trustScore, graph: graphPayload, resources: idle.map(r => ({ id: r.id, label: r.label, type: r.type, currentNodeId: r.currentNodeId, capacity: r.capacity, fuelLevel: r.fuelLevel, fatigueLevel: r.fatigueLevel, skillLevel: r.skillLevel, geographicRange: r.geographicRange })), riskMap: simData.forecastT6h, forecastT2h: simData.forecastT2h, forecastT4h: simData.forecastT4h }) as any;
    // Persist severityTier + severityScore into SimulationResult so Commander sitrep can read it
    await prisma.simulationResult.update({ where: { id: sim.id }, data: { severityTier: allocData.severityTier ?? "LOW", severityScore: allocData.severityScore ?? 0 } });
    const plan = await prisma.allocationPlan.create({ data: { simulationResultId: sim.id, status: PlanStatus.PENDING_APPROVAL, strategyUsed: allocData.strategyUsed ?? "DEMAND_DRIVEN", confidence: allocData.confidence ?? 0, totalResources: allocData.totalResources ?? 0, expiresAt: new Date(Date.now() + 30 * 60000), assignments: { create: (allocData.assignments ?? []).map((a: any) => ({ resourceId: a.resourceId, fromNodeId: a.fromNodeId, toNodeId: a.toNodeId, routeEdgeIds: [], etaMinutes: a.etaMinutes ?? 0, priority: a.priority ?? "NORMAL", confidence: a.confidence ?? 0 })) } } });
    await prisma.incident.update({ where: { id: incidentId }, data: { status: IncidentStatus.ACTIVE } });
    digitalTwinService.emit("SIMULATION_COMPLETE", { incidentId, planId: plan.id, severityTier: allocData.severityTier, totalResources: allocData.totalResources });
    console.log(`[SimWorker] Done | tier: ${allocData.severityTier} | ${allocData.totalResources} assignments`);
    return { planId: plan.id };
  },
  { connection: bullMQConnection, concurrency: 2 }
);

const closeWorker = new Worker(
  QUEUE_NAMES.INCIDENT_CLOSE,
  async (job: Job) => { await postMortemService.run(job.data.incidentId); },
  { connection: bullMQConnection }
);

simWorker.on("failed", (job, e) => { console.error(`[SimWorker] ${job?.id} failed:`, e.message); if (job?.data?.incidentId) prisma.simulationResult.updateMany({ where: { incidentId: job.data.incidentId, status: SimulationStatus.RUNNING }, data: { status: SimulationStatus.FAILED } }).catch(() => {}); });
simWorker.on("ready", () => console.log("[SimWorker] Ready"));
closeWorker.on("ready", () => console.log("[PostMortem] Ready"));
process.on("SIGTERM", async () => { await Promise.all([simWorker.close(), closeWorker.close()]); process.exit(0); });
process.on("SIGINT", async () => { await Promise.all([simWorker.close(), closeWorker.close()]); process.exit(0); });
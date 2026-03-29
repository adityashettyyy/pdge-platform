// src/services/postmortem.service.ts
// PostMortemService — the self-improving learning loop.
//
// TRIGGERED BY: incident-close BullMQ job (queued by incident.controller.ts
//               when operator sets status = CLOSED).
//
// WHAT IT DOES:
//   1. Compares BFS forecastT2h vs actual incident spread (approximated by
//      unique assignment target nodes in the allocation plan)
//   2. Computes predictionError and updates SimulationResult.overallAccuracy
//   3. Updates spreadCoefficient via EMA so next simulation is more accurate
//   4. Logs response time delta: PDGE ETA vs 18-minute traditional baseline
//
// WHY EMA (exponential moving average):
//   A single incident might be an outlier (unusual weather, bad GPS).
//   EMA dampens noise:  newCoeff = 0.8 × oldCoeff + 0.2 × correction

import { prisma } from "../config/db";
import { IncidentStatus } from "@prisma/client";

const TRADITIONAL_BASELINE_MIN = 18.0;  // industry avg without pre-positioning
const EMA_ALPHA                = 0.2;   // learning rate

export class PostMortemService {

  async run(incidentId: string): Promise<void> {
    // ── Guard: only run on truly closed incidents ────────────────────────
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        simResults: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            allocationPlans: {
              take: 1,
              include: {
                assignments: { select: { toNodeId: true, etaMinutes: true } },
              },
            },
          },
        },
      },
    });

    if (!incident) {
      console.warn(`[PostMortem] Incident ${incidentId} not found`);
      return;
    }
    if (incident.status !== IncidentStatus.CLOSED) {
      console.warn(`[PostMortem] Incident ${incidentId} is not CLOSED (${incident.status})`);
      return;
    }

    const simResult = incident.simResults[0];
    if (!simResult) {
      console.warn(`[PostMortem] No simulation result for incident ${incidentId}`);
      return;
    }
    if (simResult.status !== "COMPLETED") {
      console.warn(`[PostMortem] SimulationResult not COMPLETED for ${incidentId}`);
      return;
    }

    // ── 1. Prediction accuracy ───────────────────────────────────────────
    const forecastT2h = (simResult.forecastT2h as Record<string, number> | null) ?? {};
    const forecastedHighRisk = Object.values(forecastT2h).filter(r => r > 0.5).length;

    const plan          = simResult.allocationPlans[0] ?? null;
    const actualTargets = plan
      ? new Set(plan.assignments.map(a => a.toNodeId)).size
      : forecastedHighRisk;   // no plan = assume forecast was correct

    // predictionError: 0.0 = perfect, 1.0 = completely wrong
    const predictionError = forecastedHighRisk > 0
      ? Math.abs(forecastedHighRisk - actualTargets) / forecastedHighRisk
      : 0.0;
    const accuracy = Math.max(0, 1.0 - predictionError);

    await prisma.simulationResult.update({
      where: { id: simResult.id },
      data: {
        predictionErrorT2h: predictionError,
        overallAccuracy:    accuracy,
      },
    });

    // ── 2. Update spreadCoefficient via EMA ──────────────────────────────
    const currentCoeff = simResult.spreadCoefficient;

    // Determine if we over- or under-predicted spread
    let correction = currentCoeff;
    if (forecastedHighRisk > actualTargets * 1.3) {
      // Over-predicted: coefficient was too high → shrink it
      correction = currentCoeff * 0.95;
    } else if (forecastedHighRisk < actualTargets * 0.7) {
      // Under-predicted: coefficient was too low → grow it
      correction = currentCoeff * 1.05;
    }
    // Clamp to safe operational range
    const newCoeff = Math.min(0.90, Math.max(0.10,
      (1 - EMA_ALPHA) * currentCoeff + EMA_ALPHA * correction
    ));

    // Persist in org metadata for next simulation to read
    // Using `tier` field as a KV store is a workaround until an OrgSettings model
    // is added.  Replace with a proper metadata column when ready.
    await prisma.organization.update({
      where: { id: incident.organizationId },
      data:  { tier: `spreadCoeff:${newCoeff.toFixed(4)}` },
    });

    // ── 3. Response time delta ───────────────────────────────────────────
    let pdgeResponseMin: number | null = null;
    if (plan && plan.assignments.length > 0) {
      const etas = plan.assignments.map(a => a.etaMinutes as number);
      pdgeResponseMin = Math.min(...etas);
    }
    const deltaMin = pdgeResponseMin !== null
      ? TRADITIONAL_BASELINE_MIN - pdgeResponseMin
      : null;

    // ── 4. Log ───────────────────────────────────────────────────────────
    console.log(
      `[PostMortem] ${incidentId} | ` +
      `Accuracy: ${(accuracy * 100).toFixed(1)}% | ` +
      `Coeff: ${currentCoeff.toFixed(3)} → ${newCoeff.toFixed(3)} | ` +
      `Delta: ${deltaMin !== null ? `${deltaMin.toFixed(1)} min faster` : "n/a"}`
    );
  }
}

export const postMortemService = new PostMortemService();
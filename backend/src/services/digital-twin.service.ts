// src/services/digital-twin.service.ts
// Live graph state manager.
//
// RESPONSIBILITIES:
//   1. Receive simulation risk map → write disasterRisk to every GraphNode in DB
//   2. Detect threshold crossings (0.3 / 0.5 / 0.8) → emit RISK_SPIKE WS event
//   3. Auto-block edges adjacent to fully critical (risk=1.0) nodes
//   4. Provide getGraphSnapshot() for the WS INITIAL_STATE event on client connect
//
// HOW WEBSOCKET CONSUMERS USE THIS:
//   server.ts subscribes to digitalTwin events and forwards them to all WS clients
//   in the relevant org room.  Frontend useWebSocket.ts receives them and updates
//   the live map + system status in real time.

import { prisma } from "../config/db";
import { EventEmitter } from "events";
import { EdgeStatus } from "@prisma/client";

const RISK_THRESHOLDS = [0.3, 0.5, 0.8] as const;

export interface RiskSpikePayload {
  nodeId:     string;
  newRisk:    number;
  threshold:  number;
  incidentId: string;
}

export interface EdgeBlockedPayload {
  edgeId:     string;
  fromNodeId: string;
  toNodeId:   string;
  reason:     string;
}

class DigitalTwinService extends EventEmitter {
  // In-memory snapshot of last known risk per node.
  // Used to detect threshold crossings without an extra DB read.
  private riskSnapshot = new Map<string, number>();

  // ── Apply simulation result ──────────────────────────────────────────────
  // Called by simulation.worker.ts after Python returns a SimulationResponse.

  async applySimulationResult(
    incidentId:    string,
    riskMap:       Record<string, number>,
    highRiskNodes: string[],
  ): Promise<void> {
    const highRiskSet = new Set(highRiskNodes);
    const nodeIds     = Object.keys(riskMap);

    // Write disasterRisk to DB — batch of 20 to avoid table lock
    for (let i = 0; i < nodeIds.length; i += 20) {
      const batch = nodeIds.slice(i, i + 20);
      await Promise.all(
        batch.map(nodeId =>
          prisma.graphNode.updateMany({
            where: { id: nodeId },
            data:  { disasterRisk: Math.min(riskMap[nodeId] ?? 0, 1.0) },
          })
        )
      );
    }

    // Detect threshold crossings and emit RISK_SPIKE for each
    for (const nodeId of highRiskSet) {
      const prev = this.riskSnapshot.get(nodeId) ?? 0;
      const curr = Math.min(riskMap[nodeId] ?? 0, 1.0);

      // Emit for the highest newly-crossed threshold only (avoid duplicate events)
      for (let t = RISK_THRESHOLDS.length - 1; t >= 0; t--) {
        const threshold = RISK_THRESHOLDS[t];
        if (prev < threshold && curr >= threshold) {
          const payload: RiskSpikePayload = {
            nodeId, newRisk: curr, threshold, incidentId,
          };
          this.emit("RISK_SPIKE", payload);
          break;
        }
      }

      this.riskSnapshot.set(nodeId, curr);

      // Auto-block adjacent edges when a node reaches full saturation
      if (curr >= 1.0) {
        await this.autoBlockEdgesForCriticalNode(nodeId).catch(err =>
          console.error(`[DigitalTwin] autoBlock failed for ${nodeId}:`, err)
        );
      }
    }

    console.log(
      `[DigitalTwin] Risk applied | ${highRiskNodes.length} high-risk nodes | ${incidentId}`
    );
  }

  // ── Block a single edge ──────────────────────────────────────────────────

  async blockEdge(edgeId: string, reason: string): Promise<void> {
    let edge: { fromNodeId: string; toNodeId: string };
    try {
      edge = await prisma.graphEdge.update({
        where: { id: edgeId },
        data:  { status: EdgeStatus.BLOCKED, blockedReason: reason },
        select: { fromNodeId: true, toNodeId: true },
      });
    } catch {
      // Edge may already be blocked or deleted — not fatal
      return;
    }

    const payload: EdgeBlockedPayload = {
      edgeId,
      fromNodeId: edge.fromNodeId,
      toNodeId:   edge.toNodeId,
      reason,
    };
    this.emit("EDGE_BLOCKED", payload);
    console.log(`[DigitalTwin] BLOCKED ${edge.fromNodeId} → ${edge.toNodeId}`);
  }

  // ── Auto-block all open edges adjacent to a fully-critical node ──────────

  async autoBlockEdgesForCriticalNode(nodeId: string): Promise<void> {
    const edges = await prisma.graphEdge.findMany({
      where: {
        OR: [{ fromNodeId: nodeId }, { toNodeId: nodeId }],
        NOT: { status: EdgeStatus.BLOCKED },
      },
      select: { id: true },
    });
    // Block sequentially to avoid race conditions on the same edge
    for (const { id } of edges) {
      await this.blockEdge(id, `Auto-blocked: node ${nodeId} at risk 1.0`);
    }
  }

  // ── Graph snapshot for WS INITIAL_STATE ─────────────────────────────────
  // Called when a new WebSocket client connects and needs the full current state.

  async getGraphSnapshot(organizationId: string) {
    const [nodes, edges] = await Promise.all([
      prisma.graphNode.findMany({
        where: { organizationId, isActive: true },
      }),
      prisma.graphEdge.findMany({
        where: { organizationId },
      }),
    ]);

    const riskMap: Record<string, number> = {};
    for (const node of nodes) {
      riskMap[node.id] = node.disasterRisk;
    }

    return { nodes, edges, riskMap };
  }
}

// Singleton — imported by simulation.worker.ts and server.ts
export const digitalTwin = new DigitalTwinService();
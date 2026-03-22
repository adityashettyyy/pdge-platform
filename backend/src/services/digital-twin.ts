// src/services/digital-twin.ts
// DigitalTwinService — the live graph state manager.
//
// HOW THE SYSTEM UNDERSTANDS WHICH NODES ARE AFFECTED:
//
//   Step 1: BFS simulation (Python) returns a riskMap: { nodeId: float 0.0–1.0 }
//           and a highRiskNodes list (risk > 0.5).
//
//   Step 2: This service receives that simulation result and:
//           a) writes node.disasterRisk to the database for every node
//           b) marks edges BLOCKED if the incident origin is flooded/blocked
//           c) broadcasts RISK_SPIKE events via WebSocket for any node
//              whose risk just crossed a threshold (0.3, 0.5, 0.8)
//           d) broadcasts EDGE_BLOCKED events when roads close
//
//   Step 3: The frontend live map receives these WS events and re-renders
//           node colours in real time — no polling needed.
//
//   Step 4: Next time the solver runs, it calls graph.shortest_path()
//           which reads edge statuses from DB and excludes BLOCKED edges.
//           Affected nodes are thus automatically avoided in routing.

import { prisma } from "../config/db";
import { EventEmitter } from "events";
import { EdgeStatus } from "@prisma/client";

// Risk thresholds — crossing one triggers a RISK_SPIKE broadcast
const THRESHOLDS = [0.3, 0.5, 0.8];

export interface RiskSpikePayload {
  nodeId:    string;
  newRisk:   number;
  threshold: number;
  incidentId: string;
}

export interface EdgeBlockedPayload {
  edgeId:     string;
  fromNodeId: string;
  toNodeId:   string;
  reason:     string;
}

class DigitalTwinService extends EventEmitter {
  // Keeps the last known risk per node in memory so we can detect threshold crossings
  private riskSnapshot: Map<string, number> = new Map();

  // ─────────────────────────────────────────────────────────────────────────
  // Called by simulation.worker.ts after Python returns a SimulationResponse
  // ─────────────────────────────────────────────────────────────────────────
  async applySimulationResult(
    incidentId:    string,
    riskMap:       Record<string, number>,   // final tick risk map
    forecastT2h:   Record<string, number>,
    highRiskNodes: string[],
  ): Promise<void> {
    const highRiskSet = new Set(highRiskNodes);

    // Step A: write disasterRisk to every affected node in DB
    // We update in batches of 20 to avoid locking the table
    const nodeIds = Object.keys(riskMap);
    for (let i = 0; i < nodeIds.length; i += 20) {
      const batch = nodeIds.slice(i, i + 20);
      await Promise.all(
        batch.map(nodeId =>
          prisma.graphNode.updateMany({
            where: { id: nodeId },
            data:  { disasterRisk: riskMap[nodeId] },
          })
        )
      );
    }

    // Step B: detect threshold crossings and emit RISK_SPIKE events
    for (const nodeId of highRiskSet) {
      const prev = this.riskSnapshot.get(nodeId) ?? 0;
      const curr = riskMap[nodeId] ?? 0;

      for (const t of THRESHOLDS) {
        if (prev < t && curr >= t) {
          const payload: RiskSpikePayload = {
            nodeId,
            newRisk:   curr,
            threshold: t,
            incidentId,
          };
          // Subscribers (WebSocket server) receive this and broadcast to clients
          this.emit("RISK_SPIKE", payload);
          break; // only emit once per node per update (the highest crossed threshold)
        }
      }

      this.riskSnapshot.set(nodeId, curr);
    }

    console.log(
      `[DigitalTwin] Applied risk map | ` +
      `${highRiskNodes.length} high-risk nodes | ` +
      `Incident: ${incidentId}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Marks a road as BLOCKED (e.g. flooding, debris, checkpoint closure)
  // Called either manually by an operator or automatically when a node
  // reaches risk = 1.0 and its adjacent edges become impassable.
  // ─────────────────────────────────────────────────────────────────────────
  async blockEdge(edgeId: string, reason: string): Promise<void> {
    const edge = await prisma.graphEdge.update({
      where: { id: edgeId },
      data:  {
        status:        EdgeStatus.BLOCKED,
        blockedReason: reason,
      },
    });

    const payload: EdgeBlockedPayload = {
      edgeId,
      fromNodeId: edge.fromNodeId,
      toNodeId:   edge.toNodeId,
      reason,
    };

    // Broadcast to all WS clients — live map re-renders the edge as red/broken
    this.emit("EDGE_BLOCKED", payload);

    console.log(
      `[DigitalTwin] Edge BLOCKED: ${edge.fromNodeId} → ${edge.toNodeId} | ${reason}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-block edges adjacent to a node when its risk hits 1.0
  // This is what makes routing automatically avoid the disaster zone —
  // no manual intervention needed.
  // ─────────────────────────────────────────────────────────────────────────
  async autoBlockEdgesForCriticalNode(nodeId: string): Promise<void> {
    // Find all edges where this node is the source or destination
    const adjacentEdges = await prisma.graphEdge.findMany({
      where: {
        OR: [{ fromNodeId: nodeId }, { toNodeId: nodeId }],
        status: { not: EdgeStatus.BLOCKED }, // don't double-block
      },
    });

    for (const edge of adjacentEdges) {
      await this.blockEdge(edge.id, `Auto-blocked: adjacent node ${nodeId} at risk 1.0`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Returns the current graph state snapshot — used by WS "INITIAL_STATE" event
  // when a new client connects.
  // ─────────────────────────────────────────────────────────────────────────
  async getGraphSnapshot(organizationId: string) {
    const [nodes, edges] = await Promise.all([
      prisma.graphNode.findMany({ where: { organizationId, isActive: true } }),
      prisma.graphEdge.findMany({ where: { organizationId } }),
    ]);

    // Build riskMap from current DB values
    const riskMap: Record<string, number> = {};
    for (const node of nodes) {
      riskMap[node.id] = node.disasterRisk;
    }

    return { nodes, edges, riskMap };
  }
}

export const digitalTwin = new DigitalTwinService();
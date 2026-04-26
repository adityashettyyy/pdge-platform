import { prisma } from "../config/db";
import { EventEmitter } from "events";
import { EdgeStatus } from "@prisma/client";

export interface RiskSpikePayload { nodeId: string; newRisk: number; threshold: number; incidentId: string; }
export interface EdgeBlockedPayload { edgeId: string; fromNodeId: string; toNodeId: string; reason: string; }

class DigitalTwinService extends EventEmitter {
  private riskSnapshot = new Map<string, number>();

  async applySimulationResult(incidentId: string, riskMap: Record<string, number>, highRiskNodes: string[]) {
    const nodeIds = Object.keys(riskMap);
    for (let i = 0; i < nodeIds.length; i += 20) {
      await Promise.all(nodeIds.slice(i, i + 20).map(id =>
        prisma.graphNode.updateMany({ where: { id }, data: { disasterRisk: Math.min(riskMap[id] ?? 0, 1.0) } })
      ));
    }
    for (const nodeId of new Set(highRiskNodes)) {
      const prev = this.riskSnapshot.get(nodeId) ?? 0;
      const curr = Math.min(riskMap[nodeId] ?? 0, 1.0);
      for (const t of [0.8, 0.5, 0.3]) {
        if (prev < t && curr >= t) { this.emit("RISK_SPIKE", { nodeId, newRisk: curr, threshold: t, incidentId }); break; }
      }
      this.riskSnapshot.set(nodeId, curr);
      if (curr >= 1.0) await this.autoBlockEdges(nodeId).catch(() => {});
    }
    console.log(`[DigitalTwin] ${highRiskNodes.length} high-risk nodes | ${incidentId}`);
  }

  async blockEdge(edgeId: string, reason: string) {
    try {
      const edge = await prisma.graphEdge.update({ where: { id: edgeId }, data: { status: EdgeStatus.BLOCKED, blockedReason: reason }, select: { fromNodeId: true, toNodeId: true } });
      this.emit("EDGE_BLOCKED", { edgeId, fromNodeId: edge.fromNodeId, toNodeId: edge.toNodeId, reason });
    } catch {}
  }

  async autoBlockEdges(nodeId: string) {
    const edges = await prisma.graphEdge.findMany({ where: { OR: [{ fromNodeId: nodeId }, { toNodeId: nodeId }], NOT: { status: EdgeStatus.BLOCKED } }, select: { id: true } });
    for (const { id } of edges) await this.blockEdge(id, `Auto-blocked: node ${nodeId} at risk 1.0`);
  }

  async getGraphSnapshot(organizationId: string) {
    const [nodes, edges] = await Promise.all([
      prisma.graphNode.findMany({ where: { organizationId, isActive: true } }),
      prisma.graphEdge.findMany({ where: { organizationId } }),
    ]);
    const riskMap: Record<string, number> = {};
    for (const n of nodes) riskMap[n.id] = n.disasterRisk;
    return { nodes, edges, riskMap };
  }

  subscribe(orgId: string, cb: (msg: { type: string; payload: any }) => void) {
    // Each event type gets its own named handler so we can cleanly unsubscribe.
    // Wraps payload with { type, payload } so the frontend dispatch() switch-case
    // can read msg.type correctly (previously the raw payload was sent directly,
    // making msg.type undefined and silently dropping all live updates).
    const WS_EVENTS = ["RISK_SPIKE", "EDGE_BLOCKED", "SIMULATION_COMPLETE", "ALLOCATION_APPROVED"] as const;
    const handlers: Record<string, (payload: any) => void> = {};
    for (const evt of WS_EVENTS) {
      handlers[evt] = (payload: any) => cb({ type: evt, payload });
      this.on(evt, handlers[evt]);
    }
    return () => { for (const evt of WS_EVENTS) this.off(evt, handlers[evt]); };
  }

  async loadGraph(orgId: string) { return this.getGraphSnapshot(orgId); }
}

export const digitalTwinService = new DigitalTwinService();
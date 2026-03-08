// src/services/digital-twin.ts
// The DigitalTwin — Observer Pattern.
//
// This service is the live mirror of the city graph.
// It holds the current risk state of every node in memory (Redis-backed).
// When it updates, it notifies all registered observers (WebSocket clients).
//
// Observer Pattern:
//   - DigitalTwinService = Subject
//   - WebSocket server = Observer (registered via subscribe())
//   - Graph state changes = Events
//
// HOW TO TEST STANDALONE:
//   npx ts-node src/services/__tests__/digital-twin.test.ts

import { prisma } from '../config/db'
import { redisCache, CACHE_KEYS, CACHE_TTL } from '../config/redis'
import {
  CityGraphSnapshot,
  GraphNodeData,
  GraphEdgeData,
  RiskMap,
} from '../types'

type TwinEventType = 'STATE_UPDATE' | 'EDGE_BLOCKED' | 'RISK_SPIKE' | 'SIMULATION_COMPLETE'

interface TwinEvent {
  type: TwinEventType
  organizationId: string
  payload: unknown
  timestamp: Date
}

// Observer callback type
type TwinObserver = (event: TwinEvent) => void

// ─────────────────────────────────────────────────────────
// DigitalTwinService — manages one twin per organization
// ─────────────────────────────────────────────────────────
export class DigitalTwinService {

  // Observer registry — WebSocket server registers here
  private observers: Map<string, TwinObserver[]> = new Map()

  // In-memory risk cache — faster than Redis for tick-by-tick updates
  // Flushed to Redis every 30 seconds
  private riskCache: Map<string, RiskMap> = new Map()

  // ─────────────────────────────────────────
  // OBSERVER PATTERN — subscribe / notify
  // ─────────────────────────────────────────

  subscribe(organizationId: string, observer: TwinObserver): () => void {
    const existing = this.observers.get(organizationId) ?? []
    this.observers.set(organizationId, [...existing, observer])

    // Return unsubscribe function
    return () => {
      const current = this.observers.get(organizationId) ?? []
      this.observers.set(organizationId, current.filter(o => o !== observer))
    }
  }

  private notify(organizationId: string, event: TwinEvent): void {
    const orgObservers = this.observers.get(organizationId) ?? []
    orgObservers.forEach(observer => {
      try {
        observer(event)
      } catch (err) {
        console.error('[DigitalTwin] Observer error:', err)
      }
    })
  }

  // ─────────────────────────────────────────
  // Load the city graph from DB into memory
  // Called once at startup, then updated incrementally
  // ─────────────────────────────────────────
  async loadGraph(organizationId: string): Promise<CityGraphSnapshot> {
    // Try Redis cache first
    const cached = await redisCache.get(CACHE_KEYS.TWIN_SNAPSHOT(organizationId))
    if (cached) {
      const snapshot = JSON.parse(cached) as CityGraphSnapshot
      // Warm in-memory risk cache
      const riskMap: RiskMap = {}
      snapshot.nodes.forEach(n => { riskMap[n.id] = n.disasterRisk })
      this.riskCache.set(organizationId, riskMap)
      return snapshot
    }

    // Cache miss — load from DB
    const [nodes, edges] = await Promise.all([
      prisma.graphNode.findMany({
        where: { organizationId, isActive: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.graphEdge.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const snapshot: CityGraphSnapshot = {
      organizationId,
      snapshotAt: new Date(),
      nodes: nodes.map(this._mapNode),
      edges: edges.map(this._mapEdge),
    }

    // Warm caches
    const riskMap: RiskMap = {}
    snapshot.nodes.forEach(n => { riskMap[n.id] = n.disasterRisk })
    this.riskCache.set(organizationId, riskMap)

    await redisCache.setex(
      CACHE_KEYS.TWIN_SNAPSHOT(organizationId),
      CACHE_TTL.TWIN_SNAPSHOT,
      JSON.stringify(snapshot)
    )

    return snapshot
  }

  // ─────────────────────────────────────────
  // Update risk values from simulation output
  // Called by the simulation worker after each BFS tick
  // ─────────────────────────────────────────
  async updateRisk(organizationId: string, riskMap: RiskMap): Promise<void> {
    // 1. Update in-memory cache immediately (fast)
    const current = this.riskCache.get(organizationId) ?? {}
    const updated = { ...current, ...riskMap }
    this.riskCache.set(organizationId, updated)

    // 2. Persist high-risk nodes to DB (async, don't await — fire and forget)
    const highRiskNodes = Object.entries(riskMap).filter(([, risk]) => risk > 0.1)
    if (highRiskNodes.length > 0) {
      void this._persistRiskToDB(highRiskNodes)
    }

    // 3. Refresh Redis snapshot
    await this._refreshRedisSnapshot(organizationId)

    // 4. Notify all observers (WebSocket push)
    this.notify(organizationId, {
      type: 'STATE_UPDATE',
      organizationId,
      payload: { riskMap, nodeCount: Object.keys(riskMap).length },
      timestamp: new Date(),
    })

    // 5. Check for risk spikes — notify separately so dashboard can alert
    const spikes = Object.entries(riskMap).filter(([, risk]) => risk > 0.7)
    if (spikes.length > 0) {
      this.notify(organizationId, {
        type: 'RISK_SPIKE',
        organizationId,
        payload: { spikedNodes: spikes.map(([id]) => id) },
        timestamp: new Date(),
      })
    }
  }

  // ─────────────────────────────────────────
  // Block an edge (road blocked by disaster)
  // ─────────────────────────────────────────
  async blockEdge(
    organizationId: string,
    fromNodeId: string,
    toNodeId: string,
    reason: string
  ): Promise<void> {
    await prisma.graphEdge.updateMany({
      where: {
        organizationId,
        OR: [
          { fromNodeId, toNodeId },
          { fromNodeId: toNodeId, toNodeId: fromNodeId }, // bidirectional
        ],
      },
      data: { status: 'BLOCKED', blockedReason: reason },
    })

    // Invalidate edge cache
    await redisCache.del(CACHE_KEYS.GRAPH_EDGES(organizationId))
    await redisCache.del(CACHE_KEYS.TWIN_SNAPSHOT(organizationId))

    this.notify(organizationId, {
      type: 'EDGE_BLOCKED',
      organizationId,
      payload: { fromNodeId, toNodeId, reason },
      timestamp: new Date(),
    })

    console.log(`[DigitalTwin] Edge blocked: ${fromNodeId} -> ${toNodeId} (${reason})`)
  }

  // ─────────────────────────────────────────
  // Get current risk for a specific node
  // ─────────────────────────────────────────
  getCurrentRisk(organizationId: string, nodeId: string): number {
    return this.riskCache.get(organizationId)?.[nodeId] ?? 0
  }

  // ─────────────────────────────────────────
  // Get full risk map for an organization
  // ─────────────────────────────────────────
  getRiskMap(organizationId: string): RiskMap {
    return { ...(this.riskCache.get(organizationId) ?? {}) }
  }

  // ─────────────────────────────────────────
  // Reset twin state after incident closes
  // ─────────────────────────────────────────
  async resetRisk(organizationId: string): Promise<void> {
    // Clear all risk values to 0
    const current = this.riskCache.get(organizationId) ?? {}
    const zeroed = Object.fromEntries(Object.keys(current).map(id => [id, 0]))
    this.riskCache.set(organizationId, zeroed)

    // Reset in DB
    await prisma.graphNode.updateMany({
      where: { organizationId },
      data: { disasterRisk: 0 },
    })

    // Flush cache
    await redisCache.del(CACHE_KEYS.TWIN_SNAPSHOT(organizationId))

    console.log(`[DigitalTwin] Risk reset for org: ${organizationId}`)
  }

  // ─────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────

  private async _persistRiskToDB(entries: [string, number][]): Promise<void> {
    await Promise.all(
      entries.map(([id, risk]) =>
        prisma.graphNode.update({
          where: { id },
          data: { disasterRisk: risk },
        }).catch(err => {
          console.error(`[DigitalTwin] Failed to persist risk for node ${id}:`, err)
        })
      )
    )
  }

  private async _refreshRedisSnapshot(organizationId: string): Promise<void> {
    // Invalidate so next GET /api/graph/nodes hits DB and rebuilds
    await redisCache.del(CACHE_KEYS.TWIN_SNAPSHOT(organizationId))
  }

  private _mapNode(node: any): GraphNodeData {
    return {
      id:           node.id,
      label:        node.label,
      type:         node.type,
      latitude:     node.latitude,
      longitude:    node.longitude,
      capacity:     node.capacity,
      currentLoad:  node.currentLoad,
      population:   node.population,
      disasterRisk: node.disasterRisk,
    }
  }

  private _mapEdge(edge: any): GraphEdgeData {
    return {
      id:         edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId:   edge.toNodeId,
      weight:     edge.status === 'BLOCKED' ? Infinity : edge.weight * edge.slowFactor,
      status:     edge.status,
    }
  }
}

// Singleton — one twin service, one event bus
export const digitalTwinService = new DigitalTwinService()

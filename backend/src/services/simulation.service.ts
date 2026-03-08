// src/services/simulation.service.ts
// Node.js → Python microservice HTTP bridge.
//
// This service is the ONLY place in the backend that knows
// the Python service exists. Everything else goes through here.
//
// Called by the simulation BullMQ worker after an incident is verified.

import { prisma } from '../config/db'
import { queueService } from './queue'
import { DisasterType } from '@prisma/client'

const PYTHON_URL = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'
const TIMEOUT_MS = 30_000  // 30 seconds max for simulation

// ── Types matching Python models ──────────────────────────
interface GraphNodePayload {
  id: string; label: string; type: string
  latitude: number; longitude: number
  capacity: number; currentLoad: number
  population: number; disasterRisk: number
}

interface GraphEdgePayload {
  id: string; fromNodeId: string; toNodeId: string
  weight: number; status: string; slowFactor: number
}

interface SimulatePayload {
  incidentId: string
  organizationId: string
  originNodeId: string
  disasterType: string
  graph: {
    organizationId: string
    nodes: GraphNodePayload[]
    edges: GraphEdgePayload[]
  }
  spreadCoefficient: number
  ticks: number
}

interface SimulationResult {
  incidentId: string
  forecastT2h: Record<string, number>
  forecastT4h: Record<string, number>
  forecastT6h: Record<string, number>
  confidence: number
  spreadCoefficient: number
  ticksRun: number
  highRiskNodes: string[]
}

interface AllocatePayload {
  incidentId: string
  organizationId: string
  simulationResultId: string
  graph: SimulatePayload['graph']
  resources: ResourcePayload[]
  riskMap: Record<string, number>
  forecastT2h: Record<string, number>
  forecastT4h: Record<string, number>
}

interface ResourcePayload {
  id: string; label: string; type: string
  currentNodeId: string | null
  capacity: number; fuelLevel: number
  fatigueLevel: number; skillLevel: number
  geographicRange: number
}

interface AllocationResult {
  incidentId: string
  simulationResultId: string
  strategyUsed: string
  assignments: AssignmentResult[]
  totalResources: number
  confidence: number
  expiresInMinutes: number
}

interface AssignmentResult {
  resourceId: string; resourceLabel: string
  fromNodeId: string; toNodeId: string
  routeNodeIds: string[]; etaMinutes: number
  priority: string; confidence: number
  fallbackResourceId?: string
}

// ─────────────────────────────────────────────────────────
// SimulationService
// ─────────────────────────────────────────────────────────
export class SimulationService {

  // ── Run a full simulation + allocation pipeline ───────
  async runPipeline(
    incidentId: string,
    organizationId: string,
    originNodeId: string,
    disasterType: DisasterType,
  ): Promise<void> {

    console.log(`[SimSvc] Starting pipeline for incident ${incidentId}`)

    // Step 1: Load graph from DB
    const graphPayload = await this._buildGraphPayload(organizationId)

    // Step 2: Create SimulationResult record (PENDING)
    const simRecord = await prisma.simulationResult.create({
      data: {
        incidentId,
        status:       'PENDING',
        disasterType,
        spreadCoefficient: 0.35,
      },
    })
    console.log(`[SimSvc] SimulationResult created: ${simRecord.id}`)

    // Step 3: Call Python /simulate
    const simPayload: SimulatePayload = {
      incidentId,
      organizationId,
      originNodeId,
      disasterType,
      graph: graphPayload,
      spreadCoefficient: 0.35,
      ticks: 9,
    }

    let simResult: SimulationResult
    try {
      await prisma.simulationResult.update({
        where: { id: simRecord.id },
        data:  { status: 'RUNNING', startedAt: new Date() },
      })

      simResult = await this._callPython<SimulationResult>('/simulate', simPayload)

      // Step 4: Save simulation results to DB
      await prisma.simulationResult.update({
        where: { id: simRecord.id },
        data: {
          status:           'COMPLETED',
          forecastT2h:      simResult.forecastT2h as any,
          forecastT4h:      simResult.forecastT4h as any,
          forecastT6h:      simResult.forecastT6h as any,
          confidence:       simResult.confidence,
          spreadCoefficient: simResult.spreadCoefficient,
          completedAt:      new Date(),
        },
      })
      console.log(`[SimSvc] Simulation complete | Confidence: ${simResult.confidence}`)

    } catch (err) {
      await prisma.simulationResult.update({
        where: { id: simRecord.id },
        data:  { status: 'FAILED' },
      })
      throw err
    }

    // Step 5: Load resources and call Python /allocate
    const resources = await this._buildResourcePayload(organizationId)

    const allocPayload: AllocatePayload = {
      incidentId,
      organizationId,
      simulationResultId: simRecord.id,
      graph:         graphPayload,
      resources,
      riskMap:       simResult.forecastT2h,  // current risk = T+2h forecast
      forecastT2h:   simResult.forecastT2h,
      forecastT4h:   simResult.forecastT4h,
    }

    const allocResult = await this._callPython<AllocationResult>('/allocate', allocPayload)

    // Step 6: Save AllocationPlan to DB
    const plan = await prisma.allocationPlan.create({
      data: {
        simulationResultId: simRecord.id,
        status:        'PENDING_APPROVAL',
        strategyUsed:  allocResult.strategyUsed,
        confidence:    allocResult.confidence,
        totalResources: allocResult.totalResources,
        expiresAt:     new Date(Date.now() + allocResult.expiresInMinutes * 60_000),
      },
    })

    // Step 7: Save individual resource assignments
    if (allocResult.assignments.length > 0) {
      await prisma.resourceAssignment.createMany({
        data: allocResult.assignments.map(a => ({
          planId:       plan.id,
          resourceId:   a.resourceId,
          fromNodeId:   a.fromNodeId,
          toNodeId:     a.toNodeId,
          routeEdgeIds: a.routeNodeIds,
          etaMinutes:   a.etaMinutes,
          priority:     a.priority as any,
          confidence:   a.confidence,
          fallbackResourceId: a.fallbackResourceId ?? null,
        })),
      })
    }

    console.log(
      `[SimSvc] AllocationPlan saved: ${plan.id} | ` +
      `${allocResult.totalResources} assignments | ` +
      `Strategy: ${allocResult.strategyUsed}`
    )

    // Step 8: Queue sitrep generation
    await queueService.enqueueSitrep({
      incidentId,
      organizationId,
      simulationResultId: simRecord.id,
    })
  }

  // ── Health check — verify Python service is up ────────
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${PYTHON_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  // ── PRIVATE: Call Python microservice ─────────────────
  private async _callPython<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${PYTHON_URL}${endpoint}`
    console.log(`[SimSvc] POST ${url}`)

    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Python service error (${response.status}): ${error}`)
    }

    return response.json() as Promise<T>
  }

  // ── PRIVATE: Load graph from DB ───────────────────────
  private async _buildGraphPayload(organizationId: string) {
    const [nodes, edges] = await Promise.all([
      prisma.graphNode.findMany({ where: { organizationId, isActive: true } }),
      prisma.graphEdge.findMany({ where: { organizationId } }),
    ])

    return {
      organizationId,
      nodes: nodes.map(n => ({
        id: n.id, label: n.label, type: n.type,
        latitude: n.latitude, longitude: n.longitude,
        capacity: n.capacity, currentLoad: n.currentLoad,
        population: n.population, disasterRisk: n.disasterRisk,
      })),
      edges: edges.map(e => ({
        id: e.id, fromNodeId: e.fromNodeId, toNodeId: e.toNodeId,
        weight: e.weight, status: e.status, slowFactor: e.slowFactor,
      })),
    }
  }

  // ── PRIVATE: Load resources from DB ───────────────────
  private async _buildResourcePayload(organizationId: string): Promise<ResourcePayload[]> {
    const resources = await prisma.resource.findMany({
      where: { organizationId, isActive: true, status: { not: 'MAINTENANCE' } },
    })

    return resources.map(r => ({
      id:             r.id,
      label:          r.label,
      type:           r.type,
      currentNodeId:  r.currentNodeId,
      capacity:       r.capacity,
      fuelLevel:      r.fuelLevel,
      fatigueLevel:   r.fatigueLevel,
      skillLevel:     r.skillLevel,
      geographicRange: r.geographicRange,
    }))
  }
}

export const simulationService = new SimulationService()

// src/types/index.ts
// Shared TypeScript types used across the entire backend.
// Import from here — never from individual service files.

import { Role, NodeType, ResourceType, ResourceStatus, DisasterType, IncidentStatus, TrustVerdict } from '@prisma/client'

// ── RE-EXPORTS from Prisma ──────────────────────────────
export { Role, NodeType, ResourceType, ResourceStatus, DisasterType, IncidentStatus, TrustVerdict }

// ── EXPRESS AUGMENTATION ────────────────────────────────
// Adds req.user to every authenticated request
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload
      organizationId?: string
    }
  }
}

export interface AuthPayload {
  userId: string
  email: string
  role: Role
  organizationId: string | null
}

// ── TRUST SCORE ─────────────────────────────────────────
export interface TrustScoreInput {
  incidentId: string
  reporterLat?: number
  reporterLng?: number
  claimedNodeId?: string
  gpsValid: boolean
  sensorData?: Record<string, unknown>
}

export interface TrustScoreResult {
  score: number
  verdict: TrustVerdict
  breakdown: {
    baseScore: number
    gpsBonus: number
    clusterBonus: number
    sensorBonus: number
  }
  isVerified: boolean
}

// ── GRAPH ────────────────────────────────────────────────
export interface GraphNodeData {
  id: string
  label: string
  type: NodeType
  latitude: number
  longitude: number
  capacity: number
  currentLoad: number
  population: number
  disasterRisk: number
}

export interface GraphEdgeData {
  id: string
  fromNodeId: string
  toNodeId: string
  weight: number
  status: 'OPEN' | 'SLOW' | 'BLOCKED'
}

export interface CityGraphSnapshot {
  nodes: GraphNodeData[]
  edges: GraphEdgeData[]
  organizationId: string
  snapshotAt: Date
}

// ── SIMULATION ───────────────────────────────────────────
export interface SimulationRequest {
  incidentId: string
  originNodeId: string
  disasterType: DisasterType
  organizationId: string
}

export interface RiskMap {
  [nodeId: string]: number   // 0.0 – 1.0
}

export interface SimulationForecast {
  T2h: RiskMap
  T4h: RiskMap
  T6h: RiskMap
  confidence: number
}

// ── ALLOCATION ───────────────────────────────────────────
export interface AllocationRequest {
  simulationResultId: string
  organizationId: string
  incidentId: string
}

export interface AllocationPlanOutput {
  planId: string
  strategyUsed: string
  assignments: AssignmentOutput[]
  confidence: number
  expiresAt: Date
}

export interface AssignmentOutput {
  resourceId: string
  fromNodeId: string
  toNodeId: string
  routeEdgeIds: string[]
  etaMinutes: number
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL'
  confidence: number
  fallbackResourceId?: string
}

// ── AI COMMANDER ─────────────────────────────────────────
export interface SitrepRequest {
  incidentId: string
  graphSnapshot: CityGraphSnapshot
  riskMap: RiskMap
  allocationPlan: AllocationPlanOutput
  simulationTick: number
}

export interface SitrepResponse {
  title: string
  classification: string
  body: string
  recommendedAction: 'APPROVE' | 'OVERRIDE' | 'MONITOR'
  generatedAt: Date
}

// ── JOB PAYLOADS ─────────────────────────────────────────
// These are the shapes of data put into BullMQ queues.
// Keep them serializable (no class instances, no functions).

export interface TrustScoreJobPayload {
  incidentId: string
  organizationId: string
  reportData: TrustScoreInput
}

export interface SimulationJobPayload {
  incidentId: string
  originNodeId: string
  disasterType: DisasterType
  organizationId: string
}

export interface AllocationJobPayload {
  simulationResultId: string
  incidentId: string
  organizationId: string
}

export interface SitrepJobPayload {
  incidentId: string
  organizationId: string
  simulationResultId: string
}

// ── API RESPONSE WRAPPERS ────────────────────────────────
export interface ApiSuccess<T> {
  success: true
  data: T
  message?: string
}

export interface ApiError {
  success: false
  error: string
  code?: string
  details?: unknown
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ── CONSTANTS ────────────────────────────────────────────
export const TRUST_SCORE = {
  BASE: 30,
  GPS_BONUS: 25,
  CLUSTER_BONUS_PER_REPORT: 15,
  CLUSTER_BONUS_MAX: 45,
  SENSOR_BONUS: 10,
  VERIFIED_THRESHOLD: 70,
  ACCUMULATING_THRESHOLD: 40,
} as const

export const QUEUE_NAMES = {
  TRUST_SCORE: 'trust-score',
  SIMULATION: 'simulation',
  ALLOCATION: 'allocation',
  SITREP: 'sitrep',
  POST_MORTEM: 'post-mortem',
} as const

export const SIMULATION = {
  SPREAD_COEFFICIENT_DEFAULT: 0.35,
  RISK_SPREAD_THRESHOLD: 0.1,
  ALLOCATION_TRIGGER_THRESHOLD: 0.3,
} as const

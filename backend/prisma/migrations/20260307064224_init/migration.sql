-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'AGENCY_LEAD', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('HOSPITAL', 'DEPOT', 'SHELTER', 'ZONE', 'CHECKPOINT');

-- CreateEnum
CREATE TYPE "EdgeStatus" AS ENUM ('OPEN', 'SLOW', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('AMBULANCE', 'FIRE_TRUCK', 'RESCUE_TEAM', 'DRONE', 'SUPPLY_TRUCK', 'HELICOPTER');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('IDLE', 'TRANSIT', 'DEPLOYED', 'MAINTENANCE', 'PRE_POSITIONED');

-- CreateEnum
CREATE TYPE "DisasterType" AS ENUM ('FLOOD', 'FIRE', 'EARTHQUAKE', 'CYCLONE', 'LANDSLIDE', 'CHEMICAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'ACTIVE', 'MONITORING', 'CLOSED');

-- CreateEnum
CREATE TYPE "TrustVerdict" AS ENUM ('UNVERIFIED', 'ACCUMULATING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SimulationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('GENERATED', 'PENDING_APPROVAL', 'APPROVED', 'OVERRIDDEN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssignmentPriority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'STANDARD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphNode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "NodeType" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "currentLoad" INTEGER NOT NULL DEFAULT 0,
    "population" INTEGER NOT NULL DEFAULT 0,
    "disasterRisk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphEdge" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" "EdgeStatus" NOT NULL DEFAULT 'OPEN',
    "slowFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "blockedReason" TEXT,
    "distance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'IDLE',
    "currentNodeId" TEXT,
    "targetNodeId" TEXT,
    "routeEdgeIds" TEXT[],
    "etaMinutes" INTEGER,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "fuelLevel" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "fatigueLevel" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "skillLevel" INTEGER NOT NULL DEFAULT 3,
    "geographicRange" DOUBLE PRECISION NOT NULL DEFAULT 50.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "DisasterType" NOT NULL DEFAULT 'UNKNOWN',
    "status" "IncidentStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "description" TEXT,
    "originNodeId" TEXT,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reportedById" TEXT,
    "approvedById" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "photoUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustScore" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "verdict" "TrustVerdict" NOT NULL DEFAULT 'UNVERIFIED',
    "gpsValid" BOOLEAN NOT NULL DEFAULT false,
    "clusterCount" INTEGER NOT NULL DEFAULT 1,
    "sensorData" JSONB,
    "reporterHistory" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "reporterLat" DOUBLE PRECISION,
    "reporterLng" DOUBLE PRECISION,
    "claimedNodeId" TEXT,
    "distanceToNode" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationResult" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "status" "SimulationStatus" NOT NULL DEFAULT 'PENDING',
    "disasterType" "DisasterType" NOT NULL,
    "forecastT2h" JSONB,
    "forecastT4h" JSONB,
    "forecastT6h" JSONB,
    "spreadCoefficient" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    "originRisk" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "predictionErrorT2h" DOUBLE PRECISION,
    "predictionErrorT4h" DOUBLE PRECISION,
    "predictionErrorT6h" DOUBLE PRECISION,
    "overallAccuracy" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "algorithmUsed" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationPlan" (
    "id" TEXT NOT NULL,
    "simulationResultId" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'GENERATED',
    "strategyUsed" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalResources" INTEGER NOT NULL DEFAULT 0,
    "humanApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "overrideReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllocationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAssignment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "routeEdgeIds" TEXT[],
    "etaMinutes" DOUBLE PRECISION NOT NULL,
    "priority" "AssignmentPriority" NOT NULL DEFAULT 'NORMAL',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fallbackResourceId" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "actualEtaMinutes" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "GraphNode_organizationId_idx" ON "GraphNode"("organizationId");

-- CreateIndex
CREATE INDEX "GraphNode_type_idx" ON "GraphNode"("type");

-- CreateIndex
CREATE INDEX "GraphNode_disasterRisk_idx" ON "GraphNode"("disasterRisk");

-- CreateIndex
CREATE INDEX "GraphEdge_organizationId_idx" ON "GraphEdge"("organizationId");

-- CreateIndex
CREATE INDEX "GraphEdge_status_idx" ON "GraphEdge"("status");

-- CreateIndex
CREATE INDEX "GraphEdge_fromNodeId_idx" ON "GraphEdge"("fromNodeId");

-- CreateIndex
CREATE INDEX "GraphEdge_toNodeId_idx" ON "GraphEdge"("toNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphEdge_fromNodeId_toNodeId_key" ON "GraphEdge"("fromNodeId", "toNodeId");

-- CreateIndex
CREATE INDEX "Resource_organizationId_idx" ON "Resource"("organizationId");

-- CreateIndex
CREATE INDEX "Resource_status_idx" ON "Resource"("status");

-- CreateIndex
CREATE INDEX "Resource_currentNodeId_idx" ON "Resource"("currentNodeId");

-- CreateIndex
CREATE INDEX "Resource_type_idx" ON "Resource"("type");

-- CreateIndex
CREATE INDEX "Incident_organizationId_idx" ON "Incident"("organizationId");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "Incident_type_idx" ON "Incident"("type");

-- CreateIndex
CREATE INDEX "Incident_originNodeId_idx" ON "Incident"("originNodeId");

-- CreateIndex
CREATE INDEX "TrustScore_incidentId_idx" ON "TrustScore"("incidentId");

-- CreateIndex
CREATE INDEX "TrustScore_verdict_idx" ON "TrustScore"("verdict");

-- CreateIndex
CREATE INDEX "SimulationResult_incidentId_idx" ON "SimulationResult"("incidentId");

-- CreateIndex
CREATE INDEX "SimulationResult_status_idx" ON "SimulationResult"("status");

-- CreateIndex
CREATE INDEX "AllocationPlan_simulationResultId_idx" ON "AllocationPlan"("simulationResultId");

-- CreateIndex
CREATE INDEX "AllocationPlan_status_idx" ON "AllocationPlan"("status");

-- CreateIndex
CREATE INDEX "ResourceAssignment_planId_idx" ON "ResourceAssignment"("planId");

-- CreateIndex
CREATE INDEX "ResourceAssignment_resourceId_idx" ON "ResourceAssignment"("resourceId");

-- CreateIndex
CREATE INDEX "ResourceAssignment_priority_idx" ON "ResourceAssignment"("priority");

-- CreateIndex
CREATE INDEX "AuditLog_incidentId_idx" ON "AuditLog"("incidentId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphNode" ADD CONSTRAINT "GraphNode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphEdge" ADD CONSTRAINT "GraphEdge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphEdge" ADD CONSTRAINT "GraphEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "GraphNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphEdge" ADD CONSTRAINT "GraphEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "GraphNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_currentNodeId_fkey" FOREIGN KEY ("currentNodeId") REFERENCES "GraphNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_originNodeId_fkey" FOREIGN KEY ("originNodeId") REFERENCES "GraphNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustScore" ADD CONSTRAINT "TrustScore_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationResult" ADD CONSTRAINT "SimulationResult_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationPlan" ADD CONSTRAINT "AllocationPlan_simulationResultId_fkey" FOREIGN KEY ("simulationResultId") REFERENCES "SimulationResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AllocationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

# models.py
# Pydantic models — the data contracts between Node.js and Python.
# Every request body and response is validated against these.
# If Node.js sends wrong data, Pydantic rejects it with a clear error.

from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


# ── Enums ────────────────────────────────────────────────

class NodeType(str, Enum):
    HOSPITAL   = "HOSPITAL"
    DEPOT      = "DEPOT"
    SHELTER    = "SHELTER"
    ZONE       = "ZONE"
    CHECKPOINT = "CHECKPOINT"

class EdgeStatus(str, Enum):
    OPEN    = "OPEN"
    SLOW    = "SLOW"
    BLOCKED = "BLOCKED"

class DisasterType(str, Enum):
    FLOOD      = "FLOOD"
    FIRE       = "FIRE"
    EARTHQUAKE = "EARTHQUAKE"
    CYCLONE    = "CYCLONE"
    LANDSLIDE  = "LANDSLIDE"
    CHEMICAL   = "CHEMICAL"
    UNKNOWN    = "UNKNOWN"

class ResourceType(str, Enum):
    AMBULANCE    = "AMBULANCE"
    FIRE_TRUCK   = "FIRE_TRUCK"
    RESCUE_TEAM  = "RESCUE_TEAM"
    DRONE        = "DRONE"
    SUPPLY_TRUCK = "SUPPLY_TRUCK"
    HELICOPTER   = "HELICOPTER"

class AssignmentPriority(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH     = "HIGH"
    NORMAL   = "NORMAL"


# ── Graph Input ──────────────────────────────────────────

class GraphNodeInput(BaseModel):
    id:           str
    label:        str
    type:         NodeType
    latitude:     float
    longitude:    float
    capacity:     int   = 100
    currentLoad:  int   = 0
    population:   int   = 0
    disasterRisk: float = 0.0

class GraphEdgeInput(BaseModel):
    id:         str
    fromNodeId: str
    toNodeId:   str
    weight:     float      = 1.0
    status:     EdgeStatus = EdgeStatus.OPEN
    slowFactor: float      = 1.0

class CityGraphInput(BaseModel):
    organizationId: str
    nodes:          list[GraphNodeInput]
    edges:          list[GraphEdgeInput]


# ── Resource Input ───────────────────────────────────────

class ResourceInput(BaseModel):
    id:            str
    label:         str
    type:          ResourceType
    currentNodeId: Optional[str] = None
    capacity:      int   = 4
    fuelLevel:     float = 1.0
    fatigueLevel:  float = 0.0
    skillLevel:    int   = 3
    geographicRange: float = 50.0


# ── Simulation Request / Response ────────────────────────

class SimulationRequest(BaseModel):
    incidentId:       str
    organizationId:   str
    originNodeId:     str
    disasterType:     DisasterType
    graph:            CityGraphInput
    spreadCoefficient: float = Field(default=0.35, ge=0.0, le=1.0)
    ticks:            int   = Field(default=9, ge=1, le=20)
    # 3 ticks = T+2h, 6 ticks = T+4h, 9 ticks = T+6h

class RiskMap(BaseModel):
    # nodeId -> risk float 0.0–1.0
    risks: dict[str, float]

class SimulationResponse(BaseModel):
    incidentId:   str
    forecastT2h:  dict[str, float]   # risk map at tick 3
    forecastT4h:  dict[str, float]   # risk map at tick 6
    forecastT6h:  dict[str, float]   # risk map at tick 9
    confidence:   float
    spreadCoefficient: float
    ticksRun:     int
    highRiskNodes: list[str]         # nodes with risk > 0.5


# ── Allocation Request / Response ────────────────────────

class AllocationRequest(BaseModel):
    incidentId:       str
    organizationId:   str
    simulationResultId: str
    graph:            CityGraphInput
    resources:        list[ResourceInput]
    riskMap:          dict[str, float]   # current risk per node
    forecastT2h:      dict[str, float] = Field(default_factory=dict)
    forecastT4h:      dict[str, float] = Field(default_factory=dict)

class ResourceAssignmentOutput(BaseModel):
    resourceId:          str
    resourceLabel:       str
    fromNodeId:          str
    toNodeId:            str
    routeNodeIds:        list[str]
    etaMinutes:          float
    priority:            AssignmentPriority
    confidence:          float
    fallbackResourceId:  Optional[str] = None

class AllocationResponse(BaseModel):
    incidentId:        str
    simulationResultId: str
    strategyUsed:      str
    assignments:       list[ResourceAssignmentOutput]
    totalResources:    int
    confidence:        float
    expiresInMinutes:  int = 30


# ── Health ───────────────────────────────────────────────

class HealthResponse(BaseModel):
    status:  str
    service: str
    version: str = "1.0.0"

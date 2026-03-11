# tests/test_solver.py
# Run: python tests/test_solver.py
# Tests OR-Tools allocation with 8 hardcoded resources.

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from graph.city_graph import CityGraph
from solver.allocation_solver import AllocationSolver
from models import (
    AllocationRequest, CityGraphInput,
    GraphNodeInput, GraphEdgeInput, ResourceInput,
    NodeType, EdgeStatus, ResourceType,
)


def make_graph_input() -> CityGraphInput:
    nodes = [
        GraphNodeInput(id="depot-n", label="Depot North",  type=NodeType.DEPOT,    latitude=19.15, longitude=72.85, capacity=50,  currentLoad=0, population=0,      disasterRisk=0.0),
        GraphNodeInput(id="depot-e", label="Depot East",   type=NodeType.DEPOT,    latitude=19.12, longitude=72.92, capacity=50,  currentLoad=0, population=0,      disasterRisk=0.0),
        GraphNodeInput(id="hosp-g",  label="General Hosp", type=NodeType.HOSPITAL, latitude=19.11, longitude=72.84, capacity=200, currentLoad=0, population=0,      disasterRisk=0.0),
        GraphNodeInput(id="hosp-m",  label="Metro Hosp",   type=NodeType.HOSPITAL, latitude=19.13, longitude=72.87, capacity=350, currentLoad=0, population=0,      disasterRisk=0.0),
        GraphNodeInput(id="hosp-e",  label="East Hosp",    type=NodeType.HOSPITAL, latitude=19.11, longitude=72.91, capacity=180, currentLoad=0, population=0,      disasterRisk=0.0),
        GraphNodeInput(id="zone-a",  label="Zone Alpha",   type=NodeType.ZONE,     latitude=19.09, longitude=72.86, capacity=100, currentLoad=0, population=52000,  disasterRisk=0.4),
        GraphNodeInput(id="zone-b",  label="Zone Beta",    type=NodeType.ZONE,     latitude=19.08, longitude=72.89, capacity=100, currentLoad=0, population=84000,  disasterRisk=1.0),
        GraphNodeInput(id="zone-g",  label="Zone Gamma",   type=NodeType.ZONE,     latitude=19.07, longitude=72.85, capacity=100, currentLoad=0, population=38000,  disasterRisk=0.55),
        GraphNodeInput(id="zone-d",  label="Zone Delta",   type=NodeType.ZONE,     latitude=19.07, longitude=72.90, capacity=100, currentLoad=0, population=47000,  disasterRisk=0.45),
        GraphNodeInput(id="centre",  label="City Centre",  type=NodeType.ZONE,     latitude=19.06, longitude=72.87, capacity=100, currentLoad=0, population=115000, disasterRisk=0.35),
        GraphNodeInput(id="shlt-w",  label="West Shelter", type=NodeType.SHELTER,  latitude=19.06, longitude=72.83, capacity=500, currentLoad=0, population=0,      disasterRisk=0.0),
        GraphNodeInput(id="shlt-e",  label="East Shelter", type=NodeType.SHELTER,  latitude=19.06, longitude=72.92, capacity=400, currentLoad=0, population=0,      disasterRisk=0.0),
    ]
    edges = [
        GraphEdgeInput(id="e1",  fromNodeId="depot-n", toNodeId="hosp-g",  weight=1.0),
        GraphEdgeInput(id="e2",  fromNodeId="depot-n", toNodeId="hosp-m",  weight=1.8),
        GraphEdgeInput(id="e3",  fromNodeId="depot-e", toNodeId="hosp-e",  weight=1.0),
        GraphEdgeInput(id="e4",  fromNodeId="depot-e", toNodeId="hosp-m",  weight=1.6),
        GraphEdgeInput(id="e5",  fromNodeId="hosp-g",  toNodeId="zone-a",  weight=1.2),
        GraphEdgeInput(id="e6",  fromNodeId="hosp-m",  toNodeId="zone-a",  weight=1.0),
        GraphEdgeInput(id="e7",  fromNodeId="hosp-m",  toNodeId="zone-b",  weight=1.0),
        GraphEdgeInput(id="e8",  fromNodeId="hosp-e",  toNodeId="zone-b",  weight=1.2),
        GraphEdgeInput(id="e9",  fromNodeId="hosp-g",  toNodeId="zone-g",  weight=1.6),
        GraphEdgeInput(id="e10", fromNodeId="hosp-e",  toNodeId="zone-d",  weight=1.5),
        GraphEdgeInput(id="e11", fromNodeId="hosp-m",  toNodeId="centre",  weight=1.8),
        GraphEdgeInput(id="e12", fromNodeId="zone-a",  toNodeId="zone-b",  weight=1.4),
        GraphEdgeInput(id="e13", fromNodeId="zone-a",  toNodeId="zone-g",  weight=1.1),
        GraphEdgeInput(id="e14", fromNodeId="zone-b",  toNodeId="zone-d",  weight=1.1),
        GraphEdgeInput(id="e15", fromNodeId="zone-g",  toNodeId="centre",  weight=1.0),
        GraphEdgeInput(id="e16", fromNodeId="zone-d",  toNodeId="centre",  weight=1.0),
        GraphEdgeInput(id="e17", fromNodeId="zone-g",  toNodeId="shlt-w",  weight=0.9),
        GraphEdgeInput(id="e18", fromNodeId="zone-d",  toNodeId="shlt-e",  weight=0.9),
        GraphEdgeInput(id="e19", fromNodeId="centre",  toNodeId="shlt-e",  weight=1.3),
        GraphEdgeInput(id="e20", fromNodeId="shlt-w",  toNodeId="centre",  weight=1.3),
    ]
    return CityGraphInput(organizationId="test-org", nodes=nodes, edges=edges)


def make_resources() -> list[ResourceInput]:
    return [
        ResourceInput(id="amb-01",  label="AMB-01",   type=ResourceType.AMBULANCE,   currentNodeId="depot-n", capacity=4,  fuelLevel=1.0, fatigueLevel=0.0, skillLevel=4),
        ResourceInput(id="amb-02",  label="AMB-02",   type=ResourceType.AMBULANCE,   currentNodeId="depot-n", capacity=4,  fuelLevel=0.9, fatigueLevel=0.1, skillLevel=3),
        ResourceInput(id="amb-03",  label="AMB-03",   type=ResourceType.AMBULANCE,   currentNodeId="depot-e", capacity=4,  fuelLevel=1.0, fatigueLevel=0.0, skillLevel=4),
        ResourceInput(id="amb-04",  label="AMB-04",   type=ResourceType.AMBULANCE,   currentNodeId="depot-e", capacity=4,  fuelLevel=0.8, fatigueLevel=0.2, skillLevel=3),
        ResourceInput(id="fire-01", label="FIRE-01",  type=ResourceType.FIRE_TRUCK,  currentNodeId="centre",  capacity=6,  fuelLevel=1.0, fatigueLevel=0.0, skillLevel=5),
        ResourceInput(id="fire-02", label="FIRE-02",  type=ResourceType.FIRE_TRUCK,  currentNodeId="centre",  capacity=6,  fuelLevel=0.9, fatigueLevel=0.1, skillLevel=4),
        ResourceInput(id="team-01", label="TEAM-01",  type=ResourceType.RESCUE_TEAM, currentNodeId="shlt-w",  capacity=10, fuelLevel=1.0, fatigueLevel=0.0, skillLevel=5),
        ResourceInput(id="team-02", label="TEAM-02",  type=ResourceType.RESCUE_TEAM, currentNodeId="shlt-e",  capacity=10, fuelLevel=1.0, fatigueLevel=0.0, skillLevel=4),
    ]


def test_greedy_allocation():
    print("\n─── Test 1: Greedy Allocation (8 resources) ───")
    graph  = CityGraph()
    solver = AllocationSolver(graph)

    # Risk map — zone-b is origin, spreading outward
    risk_map = {
        "zone-b": 1.0, "zone-a": 0.45, "zone-g": 0.55,
        "zone-d": 0.45, "centre": 0.35, "hosp-m": 0.2,
        "depot-n": 0.0, "depot-e": 0.0, "hosp-g": 0.05,
        "hosp-e": 0.05, "shlt-w": 0.05, "shlt-e": 0.05,
    }
    forecast_t2h = {
        "zone-b": 1.0, "zone-a": 0.6, "zone-g": 0.7,
        "zone-d": 0.6, "centre": 0.5, "hosp-m": 0.3,
        "depot-n": 0.1, "depot-e": 0.1, "hosp-g": 0.15,
        "hosp-e": 0.15, "shlt-w": 0.1, "shlt-e": 0.1,
    }

    result = solver.solve(AllocationRequest(
        incidentId="test-alloc-001",
        organizationId="test-org",
        simulationResultId="sim-001",
        graph=make_graph_input(),
        resources=make_resources(),
        riskMap=risk_map,
        forecastT2h=forecast_t2h,
    ))

    assert result.incidentId == "test-alloc-001"
    assert len(result.assignments) > 0, "Should produce at least one assignment"
    assert result.confidence > 0

    print(f"✓ Strategy:      {result.strategyUsed}")
    print(f"✓ Assignments:   {result.totalResources}")
    print(f"✓ Confidence:    {result.confidence}")
    print("\nAssignment plan:")
    for a in result.assignments:
        print(f"  [{a.priority.value:8s}] {a.resourceLabel:8s} → {a.toNodeId:12s} "
              f"via {' → '.join(a.routeNodeIds)} "
              f"(ETA: {a.etaMinutes:.1f}min)")


def test_no_resources_needed():
    print("\n─── Test 2: No Resources Needed (all risk = 0) ───")
    graph  = CityGraph()
    solver = AllocationSolver(graph)

    result = solver.solve(AllocationRequest(
        incidentId="test-alloc-002",
        organizationId="test-org",
        simulationResultId="sim-002",
        graph=make_graph_input(),
        resources=make_resources(),
        riskMap={},
        forecastT2h={},
    ))

    assert result.totalResources == 0
    assert result.strategyUsed == "NONE"
    print(f"✓ Correctly returns empty plan when no risk")


if __name__ == "__main__":
    print("══════════════════════════════════════")
    print("  AllocationSolver — Standalone Tests")
    print("══════════════════════════════════════")
    try:
        test_greedy_allocation()
        test_no_resources_needed()
        print("\n══════════════════════════════════════")
        print("  ✅ ALL SOLVER TESTS PASSED")
        print("══════════════════════════════════════\n")
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback; traceback.print_exc()

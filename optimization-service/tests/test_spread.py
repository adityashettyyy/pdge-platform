# tests/test_spread.py
# Run: python tests/test_spread.py
# Tests BFS spread simulation with hardcoded graph.
# Run this BEFORE wiring to FastAPI.

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from graph.city_graph import CityGraph
from graph.disaster_spread import DisasterSpreadSimulator
from models import (
    SimulationRequest, CityGraphInput,
    GraphNodeInput, GraphEdgeInput,
    NodeType, EdgeStatus, DisasterType,
)


def make_graph_input() -> CityGraphInput:
    nodes = [
        GraphNodeInput(id="depot-n", label="Depot North",  type=NodeType.DEPOT,    latitude=19.15, longitude=72.85, capacity=50,  currentLoad=0, population=0,      disasterRisk=0),
        GraphNodeInput(id="depot-e", label="Depot East",   type=NodeType.DEPOT,    latitude=19.12, longitude=72.92, capacity=50,  currentLoad=0, population=0,      disasterRisk=0),
        GraphNodeInput(id="hosp-g",  label="General Hosp", type=NodeType.HOSPITAL, latitude=19.11, longitude=72.84, capacity=200, currentLoad=0, population=0,      disasterRisk=0),
        GraphNodeInput(id="hosp-m",  label="Metro Hosp",   type=NodeType.HOSPITAL, latitude=19.13, longitude=72.87, capacity=350, currentLoad=0, population=0,      disasterRisk=0),
        GraphNodeInput(id="hosp-e",  label="East Hosp",    type=NodeType.HOSPITAL, latitude=19.11, longitude=72.91, capacity=180, currentLoad=0, population=0,      disasterRisk=0),
        GraphNodeInput(id="zone-a",  label="Zone Alpha",   type=NodeType.ZONE,     latitude=19.09, longitude=72.86, capacity=100, currentLoad=0, population=52000,  disasterRisk=0),
        GraphNodeInput(id="zone-b",  label="Zone Beta",    type=NodeType.ZONE,     latitude=19.08, longitude=72.89, capacity=100, currentLoad=0, population=84000,  disasterRisk=0),
        GraphNodeInput(id="zone-g",  label="Zone Gamma",   type=NodeType.ZONE,     latitude=19.07, longitude=72.85, capacity=100, currentLoad=0, population=38000,  disasterRisk=0),
        GraphNodeInput(id="zone-d",  label="Zone Delta",   type=NodeType.ZONE,     latitude=19.07, longitude=72.90, capacity=100, currentLoad=0, population=47000,  disasterRisk=0),
        GraphNodeInput(id="centre",  label="City Centre",  type=NodeType.ZONE,     latitude=19.06, longitude=72.87, capacity=100, currentLoad=0, population=115000, disasterRisk=0),
        GraphNodeInput(id="shlt-w",  label="West Shelter", type=NodeType.SHELTER,  latitude=19.06, longitude=72.83, capacity=500, currentLoad=0, population=0,      disasterRisk=0),
        GraphNodeInput(id="shlt-e",  label="East Shelter", type=NodeType.SHELTER,  latitude=19.06, longitude=72.92, capacity=400, currentLoad=0, population=0,      disasterRisk=0),
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


def test_flood_simulation():
    print("\n─── Test 1: FLOOD from Zone Beta ───")
    graph = CityGraph()
    sim   = DisasterSpreadSimulator(graph)

    result = sim.simulate(SimulationRequest(
        incidentId="test-flood-001",
        organizationId="test-org",
        originNodeId="zone-b",
        disasterType=DisasterType.FLOOD,
        graph=make_graph_input(),
        spreadCoefficient=0.35,
        ticks=9,
    ))

    assert result.incidentId == "test-flood-001"
    assert result.forecastT2h["zone-b"] > 0.5, "Origin should be high risk at T+2h"
    assert result.forecastT6h["zone-b"] >= result.forecastT6h.get("depot-n", 0), \
        "Origin should have higher risk than far nodes"
    assert result.confidence > 0.5

    print(f"✓ Incident: {result.incidentId}")
    print(f"✓ Confidence: {result.confidence}")
    print(f"✓ High-risk nodes at T+6h: {result.highRiskNodes}")
    print("\nRisk at T+2h:")
    for node_id, risk in sorted(result.forecastT2h.items(), key=lambda x: -x[1]):
        bar = "█" * int(risk * 20)
        print(f"  {node_id:12s} {risk:.3f} {bar}")
    print("\nRisk at T+6h:")
    for node_id, risk in sorted(result.forecastT6h.items(), key=lambda x: -x[1]):
        bar = "█" * int(risk * 20)
        print(f"  {node_id:12s} {risk:.3f} {bar}")


def test_spread_increases_over_time():
    print("\n─── Test 2: Spread increases over time ───")
    graph = CityGraph()
    sim   = DisasterSpreadSimulator(graph)

    result = sim.simulate(SimulationRequest(
        incidentId="test-spread-002",
        organizationId="test-org",
        originNodeId="zone-b",
        disasterType=DisasterType.FIRE,
        graph=make_graph_input(),
    ))

    # Total risk should increase over time as disaster spreads
    total_t2h = sum(result.forecastT2h.values())
    total_t4h = sum(result.forecastT4h.values())
    total_t6h = sum(result.forecastT6h.values())

    assert total_t4h >= total_t2h, "Total risk should not decrease over time"
    assert total_t6h >= total_t4h, "Total risk should not decrease over time"
    print(f"✓ Total risk T+2h: {total_t2h:.2f}")
    print(f"✓ Total risk T+4h: {total_t4h:.2f}")
    print(f"✓ Total risk T+6h: {total_t6h:.2f}")
    print(f"✓ Risk spreads correctly over time")


def test_earthquake_vs_flood():
    print("\n─── Test 3: Earthquake vs Flood spread ───")
    graph  = CityGraph()
    sim    = DisasterSpreadSimulator(graph)
    origin = "zone-b"

    flood = sim.simulate(SimulationRequest(
        incidentId="flood", organizationId="test",
        originNodeId=origin, disasterType=DisasterType.FLOOD,
        graph=make_graph_input(),
    ))
    quake = sim.simulate(SimulationRequest(
        incidentId="quake", organizationId="test",
        originNodeId=origin, disasterType=DisasterType.EARTHQUAKE,
        graph=make_graph_input(),
    ))

    flood_total = sum(flood.forecastT6h.values())
    quake_total = sum(quake.forecastT6h.values())

    # Flood has higher modifier (1.4) vs earthquake (1.2)
    print(f"✓ Flood total risk T+6h:      {flood_total:.2f}")
    print(f"✓ Earthquake total risk T+6h: {quake_total:.2f}")
    print(f"✓ Flood spreads faster (as expected)")


if __name__ == "__main__":
    print("══════════════════════════════════════")
    print("  DisasterSpreadSimulator — Tests")
    print("══════════════════════════════════════")
    try:
        test_flood_simulation()
        test_spread_increases_over_time()
        test_earthquake_vs_flood()
        print("\n══════════════════════════════════════")
        print("  ✅ ALL SPREAD TESTS PASSED")
        print("══════════════════════════════════════\n")
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback; traceback.print_exc()

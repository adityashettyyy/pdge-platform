# tests/test_graph.py
# Run: python tests/test_graph.py
# Tests CityGraph with hardcoded 12-node city.

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from graph.city_graph import CityGraph
from models import CityGraphInput, GraphNodeInput, GraphEdgeInput, NodeType, EdgeStatus

def build_test_graph() -> CityGraph:
    nodes = [
        GraphNodeInput(id="depot-n", label="Depot North",   type=NodeType.DEPOT,    latitude=19.15, longitude=72.85, capacity=50,  currentLoad=0, population=0,      disasterRisk=0),
        GraphNodeInput(id="depot-e", label="Depot East",    type=NodeType.DEPOT,    latitude=19.12, longitude=72.92, capacity=50,  currentLoad=0, population=0,      disasterRisk=0),
        GraphNodeInput(id="hosp-g",  label="General Hosp",  type=NodeType.HOSPITAL, latitude=19.11, longitude=72.84, capacity=200, currentLoad=0, population=0,      disasterRisk=0),
        GraphNodeInput(id="hosp-m",  label="Metro Hosp",    type=NodeType.HOSPITAL, latitude=19.13, longitude=72.87, capacity=350, currentLoad=0, population=0,      disasterRisk=0),
        GraphNodeInput(id="hosp-e",  label="East Hosp",     type=NodeType.HOSPITAL, latitude=19.11, longitude=72.91, capacity=180, currentLoad=0, population=0,      disasterRisk=0),
        GraphNodeInput(id="zone-a",  label="Zone Alpha",    type=NodeType.ZONE,     latitude=19.09, longitude=72.86, capacity=100, currentLoad=0, population=52000,  disasterRisk=0),
        GraphNodeInput(id="zone-b",  label="Zone Beta",     type=NodeType.ZONE,     latitude=19.08, longitude=72.89, capacity=100, currentLoad=0, population=84000,  disasterRisk=0),
        GraphNodeInput(id="zone-g",  label="Zone Gamma",    type=NodeType.ZONE,     latitude=19.07, longitude=72.85, capacity=100, currentLoad=0, population=38000,  disasterRisk=0),
        GraphNodeInput(id="zone-d",  label="Zone Delta",    type=NodeType.ZONE,     latitude=19.07, longitude=72.90, capacity=100, currentLoad=0, population=47000,  disasterRisk=0),
        GraphNodeInput(id="centre",  label="City Centre",   type=NodeType.ZONE,     latitude=19.06, longitude=72.87, capacity=100, currentLoad=0, population=115000, disasterRisk=0),
        GraphNodeInput(id="shlt-w",  label="West Shelter",  type=NodeType.SHELTER,  latitude=19.06, longitude=72.83, capacity=500, currentLoad=0, population=0,      disasterRisk=0),
        GraphNodeInput(id="shlt-e",  label="East Shelter",  type=NodeType.SHELTER,  latitude=19.06, longitude=72.92, capacity=400, currentLoad=0, population=0,      disasterRisk=0),
    ]

    edges = [
        GraphEdgeInput(id="e1",  fromNodeId="depot-n", toNodeId="hosp-g",  weight=1.0, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e2",  fromNodeId="depot-n", toNodeId="hosp-m",  weight=1.8, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e3",  fromNodeId="depot-e", toNodeId="hosp-e",  weight=1.0, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e4",  fromNodeId="depot-e", toNodeId="hosp-m",  weight=1.6, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e5",  fromNodeId="hosp-g",  toNodeId="zone-a",  weight=1.2, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e6",  fromNodeId="hosp-m",  toNodeId="zone-a",  weight=1.0, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e7",  fromNodeId="hosp-m",  toNodeId="zone-b",  weight=1.0, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e8",  fromNodeId="hosp-e",  toNodeId="zone-b",  weight=1.2, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e9",  fromNodeId="hosp-g",  toNodeId="zone-g",  weight=1.6, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e10", fromNodeId="hosp-e",  toNodeId="zone-d",  weight=1.5, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e11", fromNodeId="hosp-m",  toNodeId="centre",  weight=1.8, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e12", fromNodeId="zone-a",  toNodeId="zone-b",  weight=1.4, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e13", fromNodeId="zone-a",  toNodeId="zone-g",  weight=1.1, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e14", fromNodeId="zone-b",  toNodeId="zone-d",  weight=1.1, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e15", fromNodeId="zone-g",  toNodeId="centre",  weight=1.0, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e16", fromNodeId="zone-d",  toNodeId="centre",  weight=1.0, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e17", fromNodeId="zone-g",  toNodeId="shlt-w",  weight=0.9, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e18", fromNodeId="zone-d",  toNodeId="shlt-e",  weight=0.9, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e19", fromNodeId="centre",  toNodeId="shlt-e",  weight=1.3, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="e20", fromNodeId="shlt-w",  toNodeId="centre",  weight=1.3, status=EdgeStatus.OPEN),
    ]

    graph_input = CityGraphInput(organizationId="test-org", nodes=nodes, edges=edges)
    g = CityGraph()
    g.build(graph_input)
    return g


def test_basic_build():
    print("\n─── Test 1: Basic Graph Build ───")
    g = build_test_graph()
    assert g.node_count() == 12, f"Expected 12 nodes, got {g.node_count()}"
    print(f"✓ {g.node_count()} nodes built")

def test_shortest_path():
    print("\n─── Test 2: Shortest Path (Dijkstra) ───")
    g = build_test_graph()

    path, eta = g.shortest_path("depot-n", "zone-b")
    assert len(path) > 0, "Should find a path from depot-n to zone-b"
    assert eta < float("inf"), "ETA should be finite"
    print(f"✓ depot-n → zone-b: {' → '.join(path)} ({eta:.1f} min)")

    path2, eta2 = g.shortest_path("depot-n", "shlt-e")
    assert len(path2) > 0
    print(f"✓ depot-n → shlt-e: {' → '.join(path2)} ({eta2:.1f} min)")

def test_blocked_edge():
    print("\n─── Test 3: Blocked Edge ───")
    nodes = [
        GraphNodeInput(id="A", label="A", type=NodeType.DEPOT,   latitude=0, longitude=0, capacity=10, currentLoad=0, population=0, disasterRisk=0),
        GraphNodeInput(id="B", label="B", type=NodeType.ZONE,    latitude=0, longitude=1, capacity=10, currentLoad=0, population=0, disasterRisk=0),
        GraphNodeInput(id="C", label="C", type=NodeType.SHELTER, latitude=0, longitude=2, capacity=10, currentLoad=0, population=0, disasterRisk=0),
    ]
    edges = [
        GraphEdgeInput(id="ab", fromNodeId="A", toNodeId="B", weight=1.0, status=EdgeStatus.OPEN),
        GraphEdgeInput(id="bc", fromNodeId="B", toNodeId="C", weight=1.0, status=EdgeStatus.BLOCKED),  # blocked!
    ]
    g = CityGraph()
    g.build(CityGraphInput(organizationId="test", nodes=nodes, edges=edges))

    path, eta = g.shortest_path("A", "C")
    assert eta == float("inf"), f"Blocked path should return infinity, got {eta}"
    print(f"✓ Blocked path A→C correctly returns infinity")

def test_neighbors():
    print("\n─── Test 4: Get Neighbors ───")
    g = build_test_graph()
    neighbors = g.get_neighbors("zone-b")
    assert len(neighbors) > 0
    print(f"✓ zone-b neighbors: {[(n, f'{w:.1f}min') for n, w in neighbors]}")


if __name__ == "__main__":
    print("══════════════════════════════════════")
    print("  CityGraph — Standalone Tests")
    print("══════════════════════════════════════")
    try:
        test_basic_build()
        test_shortest_path()
        test_blocked_edge()
        test_neighbors()
        print("\n══════════════════════════════════════")
        print("  ✅ ALL GRAPH TESTS PASSED")
        print("══════════════════════════════════════\n")
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")

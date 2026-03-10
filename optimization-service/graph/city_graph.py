# graph/city_graph.py
# Builds a live NetworkX graph from node/edge data sent by Node.js.
# Every simulation and optimization runs on this graph.
#
# HOW TO TEST STANDALONE:
#   python tests/test_graph.py

import networkx as nx
from typing import Optional
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from models import CityGraphInput


class CityGraph:
    """
    Wraps NetworkX DiGraph with PDGE-specific methods.
    DiGraph = directed graph (supports one-way roads).
    Bidirectional roads = two directed edges, one each way.
    """

    def __init__(self):
        self.G: nx.DiGraph = nx.DiGraph()
        self.organization_id: str = ""

    # ─────────────────────────────────────────────────
    # Build from API input
    # ─────────────────────────────────────────────────
    def build(self, graph_input: CityGraphInput) -> None:
        self.G.clear()
        self.organization_id = graph_input.organizationId

        for node in graph_input.nodes:
            self.G.add_node(
                node.id,
                label=node.label,
                node_type=node.type,
                latitude=node.latitude,
                longitude=node.longitude,
                capacity=node.capacity,
                current_load=node.currentLoad,
                population=node.population,
                disaster_risk=node.disasterRisk,
            )

        for edge in graph_input.edges:
            if edge.status.value == "BLOCKED":
                continue

            effective_weight = edge.weight
            if edge.status.value == "SLOW":
                effective_weight = edge.weight * edge.slowFactor

            # Bidirectional
            self.G.add_edge(edge.fromNodeId, edge.toNodeId,
                weight=effective_weight, edge_id=edge.id, status=edge.status.value)
            self.G.add_edge(edge.toNodeId, edge.fromNodeId,
                weight=effective_weight, edge_id=edge.id, status=edge.status.value)

        print(f"[CityGraph] Built: {self.G.number_of_nodes()} nodes, "
              f"{self.G.number_of_edges() // 2} roads")

    # ─────────────────────────────────────────────────
    # Shortest path (Dijkstra)
    # ─────────────────────────────────────────────────
    def shortest_path(self, from_id: str, to_id: str) -> tuple[list[str], float]:
        """Returns (path_node_ids, travel_minutes). ([], inf) if no path."""
        try:
            path   = nx.dijkstra_path(self.G, from_id, to_id, weight="weight")
            length = nx.dijkstra_path_length(self.G, from_id, to_id, weight="weight")
            return path, round(length, 2)
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return [], float("inf")

    # ─────────────────────────────────────────────────
    # Neighbors — used by BFS spread simulator
    # ─────────────────────────────────────────────────
    def get_neighbors(self, node_id: str) -> list[tuple[str, float]]:
        """Returns [(neighbor_id, edge_weight), ...]. BLOCKED edges excluded."""
        if node_id not in self.G:
            return []
        return [(nb, self.G[node_id][nb]["weight"]) for nb in self.G.successors(node_id)]

    def get_node(self, node_id: str) -> Optional[dict]:
        if node_id not in self.G:
            return None
        return dict(self.G.nodes[node_id])

    def get_all_node_ids(self) -> list[str]:
        return list(self.G.nodes())

    def node_count(self) -> int:
        return self.G.number_of_nodes()

    def travel_time(self, from_id: str, to_id: str) -> float:
        _, length = self.shortest_path(from_id, to_id)
        return length

# graph/city_graph.py
# City graph builder + Dijkstra shortest path.
# Uses networkx if available, falls back to a pure-Python Dijkstra otherwise.
# Called once per simulation/allocation request — graph is rebuilt from DB snapshot.

from __future__ import annotations

import heapq
import math
from typing import Optional

try:
    import networkx as nx
    _HAS_NX = True
except ImportError:
    _HAS_NX = False

from models import CityGraphInput, EdgeStatus


# ── Pure-Python Dijkstra (used when networkx not installed) ───────────────────

def _dijkstra(
    adj: dict[str, list[tuple[str, float]]],
    source: str,
    target: str,
) -> tuple[list[str], float]:
    dist: dict[str, float] = {source: 0.0}
    prev: dict[str, Optional[str]] = {source: None}
    heap: list[tuple[float, str]] = [(0.0, source)]

    while heap:
        d, u = heapq.heappop(heap)
        if d > dist.get(u, math.inf):
            continue
        if u == target:
            break
        for v, w in adj.get(u, []):
            nd = d + w
            if nd < dist.get(v, math.inf):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(heap, (nd, v))

    if target not in dist:
        return [], math.inf

    path: list[str] = []
    cur: Optional[str] = target
    while cur is not None:
        path.append(cur)
        cur = prev.get(cur)
    path.reverse()
    return path, round(dist[target], 4)


# ── CityGraph ─────────────────────────────────────────────────────────────────

class CityGraph:
    """
    Wraps either a NetworkX DiGraph or a plain adjacency dict.

    Edge rules
    ----------
    BLOCKED  -> completely excluded (routing + spread skip it)
    SLOW     -> weight = raw_weight * slowFactor  (slowFactor >= 1.0)
    OPEN     -> weight = raw_weight
    All edges are treated as bidirectional.
    """

    def __init__(self) -> None:
        self._nx_graph: Optional[object] = None
        self._adj: dict[str, list[tuple[str, float]]] = {}
        self._nodes: dict[str, dict] = {}

    # ── Build ─────────────────────────────────────────────────────────────────

    def build(self, graph_input: CityGraphInput) -> None:
        """Rebuild graph from a CityGraphInput snapshot."""
        self._nodes = {}
        self._adj = {}
        self._nx_graph = None

        if _HAS_NX:
            self._nx_graph = nx.DiGraph()

        # Add nodes
        for node in graph_input.nodes:
            meta = {
                "label":        node.label,
                "type":         node.type.value,
                "population":   node.population,
                "latitude":     node.latitude,
                "longitude":    node.longitude,
                "disasterRisk": node.disasterRisk,
                "capacity":     node.capacity,
                "currentLoad":  node.currentLoad,
            }
            self._nodes[node.id] = meta
            self._adj.setdefault(node.id, [])
            if _HAS_NX:
                self._nx_graph.add_node(node.id, **meta)

        # Add edges — BLOCKED are fully excluded
        # seen_pairs prevents duplicate directed edges from overwriting a lighter one
        best: dict[tuple[str, str], float] = {}

        for edge in graph_input.edges:
            if edge.status == EdgeStatus.BLOCKED:
                continue

            slow = max(float(edge.slowFactor), 1.0)
            w = float(edge.weight) * (slow if edge.status == EdgeStatus.SLOW else 1.0)
            w = max(w, 0.01)   # guard against zero / negative weights

            for a, b in [(edge.fromNodeId, edge.toNodeId),
                         (edge.toNodeId,   edge.fromNodeId)]:
                if a not in self._nodes or b not in self._nodes:
                    continue   # skip orphan edges whose nodes are missing
                pair = (a, b)
                if w < best.get(pair, math.inf):
                    best[pair] = w

        # Commit best weights into adjacency structures
        for (a, b), w in best.items():
            self._adj[a].append((b, w))
            if _HAS_NX:
                self._nx_graph.add_edge(a, b, weight=w)

    # ── Shortest path ─────────────────────────────────────────────────────────

    def shortest_path(self, from_id: str, to_id: str) -> tuple[list[str], float]:
        """
        Return (path node IDs, total minutes).
        Returns ([to_id], 999.0) when unreachable or inputs are invalid.
        """
        if not from_id or from_id not in self._nodes:
            return [to_id], 999.0
        if not to_id or to_id not in self._nodes:
            return [to_id], 999.0
        if from_id == to_id:
            return [from_id], 0.0

        # NetworkX path
        if _HAS_NX and self._nx_graph is not None:
            G = self._nx_graph
            if from_id not in G or to_id not in G:
                return [to_id], 999.0
            try:
                path = nx.dijkstra_path(G, from_id, to_id, weight="weight")
                length = nx.dijkstra_path_length(G, from_id, to_id, weight="weight")
                return path, round(length, 2)
            except nx.exception.NetworkXNoPath:
                return [to_id], 999.0
            except nx.exception.NodeNotFound:
                return [to_id], 999.0
            except Exception as exc:
                print(f"[CityGraph] nx error: {exc}")
                return [to_id], 999.0

        # Pure-Python fallback
        path_fb, cost_fb = _dijkstra(self._adj, from_id, to_id)
        if not path_fb:
            return [to_id], 999.0
        return path_fb, cost_fb

    # ── Helpers ───────────────────────────────────────────────────────────────

    def get_neighbors(self, node_id: str) -> list[tuple[str, float]]:
        """(neighbor_id, weight) list for all reachable neighbors."""
        return list(self._adj.get(node_id, []))

    def has_path(self, from_id: str, to_id: str) -> bool:
        _, cost = self.shortest_path(from_id, to_id)
        return cost < 999.0

    def node_count(self) -> int:
        return len(self._nodes)

    def edge_count(self) -> int:
        """Count of directed edges (each road = 2 directed edges)."""
        return sum(len(v) for v in self._adj.values())

    def get_node_meta(self, node_id: str) -> Optional[dict]:
        return self._nodes.get(node_id)

    def __repr__(self) -> str:
        return (
            f"CityGraph(nodes={self.node_count()}, "
            f"directed_edges={self.edge_count()}, "
            f"backend={'networkx' if _HAS_NX else 'pure-python'})"
        )
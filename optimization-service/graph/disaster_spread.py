# graph/disaster_spread.py
# BFS disaster spread simulator.
#
# WHAT THIS FILE DOES:
#   Converts a single origin node into a full city-wide risk map over 9 ticks.
#   Each tick ≈ 40 real minutes.  Snapshots saved at tick 3/6/9 = T+2h/T+4h/T+6h.
#
# HOW A NODE BECOMES AFFECTED:
#   1. origin node starts at risk = 1.0
#   2. Each tick: every infected node pushes risk into OPEN/SLOW neighbours
#      via: newRisk = parentRisk * coeff * edgeFactor * nodeTypeMod
#   3. neighbour.risk = max(current, incoming)  — never decreases
#   4. BLOCKED edges are never added to adjacency — disaster cannot cross them
#   5. After 9 ticks: any node with risk > 0.5 → highRiskNodes list

from __future__ import annotations
import math
from models import SimulationRequest, SimulationResponse
from graph.city_graph import CityGraph

HIGH_RISK_THRESHOLD = 0.5

# Base spread coefficients per disaster type.
# PostMortemService updates these in the org metadata after each closed incident.
DISASTER_COEFFICIENTS: dict[str, float] = {
    "FLOOD":      0.45,
    "FIRE":       0.30,
    "EARTHQUAKE": 0.60,
    "CYCLONE":    0.50,
    "LANDSLIDE":  0.35,
    "CHEMICAL":   0.40,
    "UNKNOWN":    0.35,
}

# Structural hardening: how much risk a node type absorbs vs passes through
NODE_TYPE_MODS: dict[str, float] = {
    "HOSPITAL":   0.70,   # reinforced structure
    "DEPOT":      0.80,
    "SHELTER":    0.85,
    "ZONE":       1.00,   # residential — most vulnerable
    "CHECKPOINT": 0.90,
}


class DisasterSpreadSimulator:
    def __init__(self, graph: CityGraph) -> None:
        self.graph = graph

    def simulate(self, request: SimulationRequest) -> SimulationResponse:
        # ── 1. Build graph ────────────────────────────────────────────────
        self.graph.build(request.graph)

        # ── 2. Determine effective spread coefficient ─────────────────────
        # If caller passes a non-default value (from PostMortem learning), use it.
        base_coeff = DISASTER_COEFFICIENTS.get(
            request.disasterType.value, 0.35
        )
        coeff: float = (
            request.spreadCoefficient
            if request.spreadCoefficient != 0.35
            else base_coeff
        )
        coeff = max(0.01, min(coeff, 0.99))   # clamp to safe range

        # ── 3. Build node metadata maps ───────────────────────────────────
        valid_node_ids: set[str] = {n.id for n in request.graph.nodes}
        node_type_map:  dict[str, str]   = {
            n.id: n.type.value for n in request.graph.nodes
        }

        # ── 4. Initialise risk map ────────────────────────────────────────
        # Guard: originNodeId must actually exist in the graph
        risk: dict[str, float] = {n.id: 0.0 for n in request.graph.nodes}
        if request.originNodeId in valid_node_ids:
            risk[request.originNodeId] = 1.0
        else:
            # Fallback: use first ZONE node, or first node overall
            fallback = next(
                (n.id for n in request.graph.nodes if n.type.value == "ZONE"),
                request.graph.nodes[0].id if request.graph.nodes else None,
            )
            if fallback:
                risk[fallback] = 1.0

        # ── 5. Build adjacency (BLOCKED edges are already excluded in CityGraph,
        #       but we rebuild here for spread because edgeFactor differs from
        #       routing weight — SLOW edges reduce spread speed, not increase it)
        adjacency: dict[str, list[tuple[str, float]]] = {
            n.id: [] for n in request.graph.nodes
        }
        seen_spread_pairs: set[tuple[str, str]] = set()
        for edge in request.graph.edges:
            if edge.status.value == "BLOCKED":
                continue
            # edgeFactor: SLOW edges reduce spread (congestion slows disaster too)
            ef = (
                1.0 / max(float(edge.slowFactor), 1.0)
                if edge.status.value == "SLOW"
                else 1.0
            )
            for a, b in [
                (edge.fromNodeId, edge.toNodeId),
                (edge.toNodeId,   edge.fromNodeId),
            ]:
                if a not in valid_node_ids or b not in valid_node_ids:
                    continue
                pair = (a, b)
                if pair not in seen_spread_pairs:
                    seen_spread_pairs.add(pair)
                    adjacency[a].append((b, ef))

        # ── 6. Run ticks ─────────────────────────────────────────────────
        forecast_t2h: dict[str, float] = {}
        forecast_t4h: dict[str, float] = {}
        forecast_t6h: dict[str, float] = {}

        for tick in range(1, request.ticks + 1):
            new_risk = dict(risk)   # copy — updates based on previous tick only

            for node_id, curr_risk in risk.items():
                if curr_risk <= 0.0:
                    continue
                for neighbor_id, ef in adjacency.get(node_id, []):
                    mod     = NODE_TYPE_MODS.get(
                        node_type_map.get(neighbor_id, "ZONE"), 1.0
                    )
                    incoming = curr_risk * coeff * ef * mod
                    incoming = min(incoming, 1.0)          # cap at 1.0
                    new_risk[neighbor_id] = max(
                        new_risk.get(neighbor_id, 0.0), incoming
                    )

            risk = new_risk

            if tick == 3:
                forecast_t2h = dict(risk)
            if tick == 6:
                forecast_t4h = dict(risk)
            if tick == 9:
                forecast_t6h = dict(risk)

        # Fill missing snapshots (when ticks < 9)
        forecast_t2h = forecast_t2h or dict(risk)
        forecast_t4h = forecast_t4h or dict(risk)
        forecast_t6h = forecast_t6h or dict(risk)

        # ── 7. Derive outputs ─────────────────────────────────────────────
        high_risk_nodes = [
            nid for nid, r in risk.items() if r > HIGH_RISK_THRESHOLD
        ]

        # Confidence degrades as more nodes become high-risk
        # (wider spread = more uncertainty in exact boundaries)
        n_total      = max(len(risk), 1)
        n_high       = len(high_risk_nodes)
        confidence   = max(0.30, 1.0 - (n_high / n_total) * 0.5)

        return SimulationResponse(
            incidentId=request.incidentId,
            forecastT2h={k: round(v, 4) for k, v in forecast_t2h.items()},
            forecastT4h={k: round(v, 4) for k, v in forecast_t4h.items()},
            forecastT6h={k: round(v, 4) for k, v in forecast_t6h.items()},
            confidence=round(confidence, 3),
            spreadCoefficient=round(coeff, 4),
            ticksRun=request.ticks,
            highRiskNodes=high_risk_nodes,
        )
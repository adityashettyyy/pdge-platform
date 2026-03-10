# graph/disaster_spread.py
# BFS Epidemic Spread Simulator — the core prediction engine.
#
# CONCEPT:
#   Disaster spreads like an epidemic across the city graph.
#   Each tick = ~40 minutes real time.
#   Tick 3  = T+2h forecast
#   Tick 6  = T+4h forecast
#   Tick 9  = T+6h forecast (default)
#
# SPREAD FORMULA (per tick, per neighbor):
#   new_risk = current_risk × (spread_coefficient / edge_weight)
#   Heavy road (high weight) = slower spread
#   Light road (low weight)  = faster spread
#
# DISASTER-TYPE MODIFIERS:
#   FLOOD      — spreads along low-weight edges fast (water flows)
#   FIRE       — moderate spread, slows at checkpoints
#   EARTHQUAKE — radial spread, distance-based decay
#   CYCLONE    — directional, fast
#   CHEMICAL   — very fast, wind-direction aware (simplified here)
#
# HOW TO TEST STANDALONE:
#   python tests/test_spread.py

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from graph.city_graph import CityGraph
from models import SimulationRequest, SimulationResponse, DisasterType
from collections import deque


# Spread coefficient multipliers per disaster type
DISASTER_MODIFIERS: dict[str, float] = {
    DisasterType.FLOOD:      1.4,   # fast — water follows topology
    DisasterType.FIRE:       1.0,   # moderate
    DisasterType.EARTHQUAKE: 1.2,   # radial, medium
    DisasterType.CYCLONE:    1.6,   # very fast
    DisasterType.LANDSLIDE:  0.8,   # slow, terrain-bound
    DisasterType.CHEMICAL:   1.5,   # fast, wind-carried
    DisasterType.UNKNOWN:    1.0,   # default
}

# Node type resistance — some nodes slow spread
# 1.0 = no resistance, 0.5 = spreads at half rate into this node
NODE_RESISTANCE: dict[str, float] = {
    "HOSPITAL":   0.9,   # hospitals have some infrastructure protection
    "DEPOT":      0.8,   # depots are typically reinforced
    "SHELTER":    0.9,
    "ZONE":       1.0,   # residential zones — no resistance
    "CHECKPOINT": 0.7,   # checkpoints slow spread
}


class DisasterSpreadSimulator:
    """
    BFS-based epidemic spread model adapted for physical disaster propagation.

    Uses modified BFS where:
      - Each node has a risk value 0.0–1.0
      - Each tick propagates risk to neighbors
      - Edge weight inversely affects spread speed
      - Disaster type applies a global modifier
    """

    def __init__(self, graph: CityGraph):
        self.graph = graph

    # ─────────────────────────────────────────────────
    # Main entry point
    # ─────────────────────────────────────────────────
    def simulate(self, request: SimulationRequest) -> SimulationResponse:
        """
        Run the full BFS simulation and return 3 forecasts.
        """
        print(f"\n[Spread] Starting simulation for incident {request.incidentId}")
        print(f"[Spread] Origin: {request.originNodeId} | Type: {request.disasterType}")
        print(f"[Spread] Coefficient: {request.spreadCoefficient} | Ticks: {request.ticks}")

        # Build graph from request
        self.graph.build(request.graph)

        # Get disaster modifier
        modifier = DISASTER_MODIFIERS.get(request.disasterType, 1.0)
        effective_coefficient = request.spreadCoefficient * modifier

        print(f"[Spread] Effective coefficient: {effective_coefficient:.3f} "
              f"(base {request.spreadCoefficient} × modifier {modifier})")

        # Initialize risk map — all zeros except origin
        risk_map: dict[str, float] = {
            node_id: 0.0
            for node_id in self.graph.get_all_node_ids()
        }

        if request.originNodeId not in risk_map:
            print(f"[Spread] WARNING: origin node {request.originNodeId} not in graph!")
            # Use first node as fallback
            all_nodes = self.graph.get_all_node_ids()
            if all_nodes:
                request.originNodeId = all_nodes[0]
            else:
                raise ValueError("Graph has no nodes")

        risk_map[request.originNodeId] = 1.0  # Origin starts at full risk

        # Snapshots at ticks 3, 6, 9
        snapshot_t2h: dict[str, float] = {}
        snapshot_t4h: dict[str, float] = {}
        snapshot_t6h: dict[str, float] = {}

        # Run ticks
        for tick in range(1, request.ticks + 1):
            risk_map = self._run_tick(risk_map, effective_coefficient, request.disasterType)

            # Log progress
            high_risk = sum(1 for r in risk_map.values() if r > 0.5)
            print(f"[Spread] Tick {tick:2d} | High-risk nodes: {high_risk} | "
                  f"Max risk: {max(risk_map.values()):.3f}")

            # Capture snapshots
            if tick == 3:
                snapshot_t2h = dict(risk_map)
            if tick == 6:
                snapshot_t4h = dict(risk_map)
            if tick == 9:
                snapshot_t6h = dict(risk_map)

        # If ticks < 9, fill missing snapshots with last state
        if not snapshot_t2h:
            snapshot_t2h = dict(risk_map)
        if not snapshot_t4h:
            snapshot_t4h = dict(risk_map)
        if not snapshot_t6h:
            snapshot_t6h = dict(risk_map)

        # High risk nodes at T+6h
        high_risk_nodes = [
            node_id for node_id, risk in snapshot_t6h.items()
            if risk > 0.5
        ]

        # Confidence — based on graph connectivity and spread predictability
        confidence = self._calculate_confidence(request, snapshot_t6h)

        print(f"\n[Spread] Complete | High-risk at T+6h: {len(high_risk_nodes)} nodes")
        print(f"[Spread] Confidence: {confidence:.2f}")

        return SimulationResponse(
            incidentId=request.incidentId,
            forecastT2h={k: round(v, 4) for k, v in snapshot_t2h.items()},
            forecastT4h={k: round(v, 4) for k, v in snapshot_t4h.items()},
            forecastT6h={k: round(v, 4) for k, v in snapshot_t6h.items()},
            confidence=confidence,
            spreadCoefficient=effective_coefficient,
            ticksRun=request.ticks,
            highRiskNodes=high_risk_nodes,
        )

    # ─────────────────────────────────────────────────
    # Single BFS tick
    # ─────────────────────────────────────────────────
    def _run_tick(
        self,
        current_risk: dict[str, float],
        coefficient: float,
        disaster_type: str,
    ) -> dict[str, float]:
        """
        One simulation tick — propagate risk to all neighbors.

        Formula:
          spread_amount = source_risk × (coefficient / edge_weight)
          new_risk = max(current_risk, spread_amount × node_resistance)

        We use max() not addition so risk caps at 1.0 naturally.
        """
        new_risk = dict(current_risk)  # copy current state

        # Only propagate from nodes that actually have risk
        active_nodes = [
            node_id for node_id, risk in current_risk.items()
            if risk > 0.01  # ignore negligible risk
        ]

        for node_id in active_nodes:
            source_risk = current_risk[node_id]
            neighbors   = self.graph.get_neighbors(node_id)

            for neighbor_id, edge_weight in neighbors:
                # Higher edge weight = slower spread
                # Edge weight is travel time in minutes
                # Normalize: weight 1.0 = full spread, weight 5.0 = 20% spread
                spread_factor = coefficient / max(edge_weight, 0.1)

                # Cap spread factor at 0.95 — risk never fully transfers in one tick
                spread_factor = min(spread_factor, 0.95)

                # Apply node resistance
                node = self.graph.get_node(neighbor_id)
                node_type = node.get("node_type", "ZONE") if node else "ZONE"
                # node_type may be an enum value or string
                node_type_str = node_type.value if hasattr(node_type, 'value') else str(node_type)
                resistance = NODE_RESISTANCE.get(node_type_str, 1.0)

                spread_amount = source_risk * spread_factor * resistance

                # New risk is the max of current and incoming spread
                new_risk[neighbor_id] = min(
                    1.0,
                    max(new_risk[neighbor_id], spread_amount)
                )

        # Apply decay at origin — disaster doesn't stay at full intensity forever
        # 2% decay per tick at origin after first tick
        origin_risk = new_risk.get(list(current_risk.keys())[0], 0)
        if origin_risk > 0:
            for node_id in active_nodes:
                if current_risk[node_id] == 1.0:  # this is origin
                    new_risk[node_id] = max(0.7, new_risk[node_id] * 0.98)

        return new_risk

    # ─────────────────────────────────────────────────
    # Confidence calculation
    # ─────────────────────────────────────────────────
    def _calculate_confidence(
        self,
        request: SimulationRequest,
        final_risk: dict[str, float],
    ) -> float:
        """
        Confidence in the simulation result.
        Higher when:
          - Graph is well-connected (more data)
          - Disaster type has a known spread pattern
          - Origin node is clearly identified

        Starts at 0.85 and adjusts based on factors.
        """
        confidence = 0.85

        # Well-known disaster types have higher confidence
        high_confidence_types = {
            DisasterType.FLOOD, DisasterType.FIRE, DisasterType.EARTHQUAKE
        }
        if request.disasterType in high_confidence_types:
            confidence += 0.05

        # More nodes = more data = higher confidence (up to a point)
        node_count = self.graph.node_count()
        if node_count >= 10:
            confidence += 0.02
        if node_count >= 20:
            confidence += 0.02

        # If spread is very contained (origin only), lower confidence
        # — may mean graph connectivity issue
        nodes_with_risk = sum(1 for r in final_risk.values() if r > 0.1)
        if nodes_with_risk <= 1:
            confidence -= 0.2

        return round(min(0.99, max(0.30, confidence)), 2)

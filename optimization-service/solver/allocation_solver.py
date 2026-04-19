# solver/allocation_solver.py
# Demand-driven resource allocation solver.
#
# PIPELINE:
#   1. SeverityClassifier scores the incident (0–100) from 4 inputs
#   2. Score maps to tier: LOW / MEDIUM / HIGH / CRITICAL
#   3. DEMAND_MATRIX[tier] gives required quantity per resource type
#   4. For each resource type, solver assigns idle inventory to high-risk targets
#      — each type gets a FRESH pass over all targets (bug fixed vs previous version)
#   5. Dijkstra (city_graph) finds the safe route avoiding BLOCKED edges
#   6. Shortfalls logged when inventory < demand

from __future__ import annotations
import math
from models import (
    AllocationRequest, AllocationResponse,
    ResourceAssignmentOutput, AssignmentPriority,
    ResourceInput, GraphNodeInput, SeverityTier,
)
from graph.city_graph import CityGraph

# ── Severity weights ──────────────────────────────────────────────────────────

DISASTER_TYPE_WEIGHTS: dict[str, float] = {
    "EARTHQUAKE": 1.25,
    "CYCLONE":    1.10,
    "FLOOD":      1.00,
    "CHEMICAL":   1.00,
    "LANDSLIDE":  0.90,
    "FIRE":       0.85,
    "UNKNOWN":    0.70,
}

# Bonus points when a critical facility is in the high-risk zone
INFRA_BONUS: dict[str, float] = {
    "HOSPITAL":   20.0,
    "DEPOT":      12.0,
    "SHELTER":     8.0,
    "ZONE":        0.0,
    "CHECKPOINT":  0.0,
}

# ── Demand matrix ─────────────────────────────────────────────────────────────
# Minimum resources required per severity tier.
# Shortfalls are logged but do NOT block plan creation.

DEMAND_MATRIX: dict[str, dict[str, int]] = {
    "LOW": {
        "AMBULANCE":    1,
        "RESCUE_TEAM":  1,
        "SUPPLY_TRUCK": 1,
        "FIRE_TRUCK":   0,
        "HELICOPTER":   0,
        "DRONE":        1,
    },
    "MEDIUM": {
        "AMBULANCE":    3,
        "RESCUE_TEAM":  2,
        "SUPPLY_TRUCK": 2,
        "FIRE_TRUCK":   1,
        "HELICOPTER":   0,
        "DRONE":        2,
    },
    "HIGH": {
        "AMBULANCE":    6,
        "RESCUE_TEAM":  4,
        "SUPPLY_TRUCK": 4,
        "FIRE_TRUCK":   2,
        "HELICOPTER":   1,
        "DRONE":        3,
    },
    "CRITICAL": {
        "AMBULANCE":    10,
        "RESCUE_TEAM":   6,
        "SUPPLY_TRUCK":  6,
        "FIRE_TRUCK":    3,
        "HELICOPTER":    2,
        "DRONE":         4,
    },
}

TIER_PRIORITY: dict[str, AssignmentPriority] = {
    "CRITICAL": AssignmentPriority.CRITICAL,
    "HIGH":     AssignmentPriority.HIGH,
    "MEDIUM":   AssignmentPriority.NORMAL,
    "LOW":      AssignmentPriority.NORMAL,
}


# ── Severity classifier ───────────────────────────────────────────────────────

class SeverityClassifier:
    """
    Converts simulation output + incident metadata → severity tier.

    Score formula (0–100):
      type_score       = disaster_type_weight × 30       (0–30 pts)
      spread_score     = min(high_risk_count × 5, 30)    (0–30 pts)
      population_score = min(log(total_pop+1) × 2.5, 20) (0–20 pts)
      infra_score      = bonus for HOSPITAL/DEPOT in zone (0–20 pts)
      trust_factor     = 0.80 + (trust_score/100) × 0.20 (scales result)
    """

    def classify(
        self,
        disaster_type:  str,
        high_risk_nodes: list[str],
        node_map:       dict[str, GraphNodeInput],
        trust_score:    float = 100.0,
    ) -> tuple[str, float]:
        type_weight  = DISASTER_TYPE_WEIGHTS.get(disaster_type, 0.70)
        type_score   = type_weight * 30.0
        spread_score = min(len(high_risk_nodes) * 5.0, 30.0)

        total_pop = sum(
            node_map[nid].population
            for nid in high_risk_nodes
            if nid in node_map
        )
        population_score = min(math.log(total_pop + 1) * 2.5, 20.0)

        infra_score = 0.0
        seen_types: set[str] = set()
        for nid in high_risk_nodes:
            node = node_map.get(nid)
            if node and node.type.value not in seen_types:
                bonus = INFRA_BONUS.get(node.type.value, 0.0)
                if bonus > 0:
                    infra_score = min(infra_score + bonus, 20.0)
                    seen_types.add(node.type.value)

        raw_score    = type_score + spread_score + population_score + infra_score
        trust_factor = 0.80 + (max(0.0, min(trust_score, 100.0)) / 100.0) * 0.20
        final_score  = raw_score * trust_factor

        if   final_score >= 75: tier = "CRITICAL"
        elif final_score >= 50: tier = "HIGH"
        elif final_score >= 25: tier = "MEDIUM"
        else:                   tier = "LOW"

        return tier, round(final_score, 1)


# ── Allocation solver ─────────────────────────────────────────────────────────

class AllocationSolver:
    def __init__(self, graph: CityGraph) -> None:
        self.graph      = graph
        self.classifier = SeverityClassifier()

    def solve(self, request: AllocationRequest) -> AllocationResponse:
        # Build / rebuild graph from this request's snapshot
        self.graph.build(request.graph)
        node_map: dict[str, GraphNodeInput] = {
            n.id: n for n in request.graph.nodes
        }

        # ── Severity classification ───────────────────────────────────────
        # Use forecastT2h as the primary risk map (nearest-term threat)
        score_map: dict[str, float] = (
            request.forecastT2h if request.forecastT2h else request.riskMap
        )
        high_risk_nodes = [nid for nid, r in score_map.items() if r > 0.5]

        disaster_type: str = getattr(request, "disasterType", "UNKNOWN")
        if hasattr(disaster_type, "value"):
            disaster_type = disaster_type.value

        trust_score: float = float(getattr(request, "trustScore", 100.0))

        tier, severity_score = self.classifier.classify(
            disaster_type=disaster_type,
            high_risk_nodes=high_risk_nodes,
            node_map=node_map,
            trust_score=trust_score,
        )

        demand   = dict(DEMAND_MATRIX.get(tier, DEMAND_MATRIX["LOW"]))
        priority = TIER_PRIORITY[tier]

        # Targets sorted highest-risk first (stable — ties broken by node id)
        sorted_targets: list[tuple[str, float]] = sorted(
            score_map.items(), key=lambda x: (-x[1], x[0])
        )
        # Filter out negligible-risk targets up front
        viable_targets = [(nid, r) for nid, r in sorted_targets if r > 0.10]

        # Group idle resources by type
        resources_by_type: dict[str, list[ResourceInput]] = {}
        for r in request.resources:
            resources_by_type.setdefault(r.type.value, []).append(r)

        assignments: list[ResourceAssignmentOutput] = []
        shortfalls:  dict[str, int] = {}

        # ── FIX: each resource type gets an independent pass over ALL targets ──
        # Previous version had a shared target_idx across all types, so later
        # types (e.g. RESCUE_TEAM) only saw targets that AMBULANCE didn't take.
        # Correct behaviour: every type sends resources to the highest-risk nodes.

        for rtype, qty_needed in demand.items():
            if qty_needed == 0:
                continue

            available = list(resources_by_type.get(rtype, []))
            assigned  = 0
            t_idx     = 0   # ← INDEPENDENT index per resource type

            while assigned < qty_needed and available:
                if t_idx >= len(viable_targets):
                    break   # no more viable targets for this type

                resource            = available.pop(0)
                target_id, tgt_risk = viable_targets[t_idx]
                t_idx += 1

                origin        = resource.currentNodeId or ""
                path, eta     = self.graph.shortest_path(origin, target_id)

                # If no route found (999), still record assignment but flag it
                reachable = eta < 999.0

                assignments.append(ResourceAssignmentOutput(
                    resourceId=resource.id,
                    resourceLabel=resource.label,
                    fromNodeId=origin,
                    toNodeId=target_id,
                    routeNodeIds=path if reachable else [target_id],
                    etaMinutes=round(eta if reachable else 0.0, 1),
                    priority=priority,
                    confidence=round(tgt_risk * (1.0 if reachable else 0.3), 3),
                ))
                assigned += 1

            if assigned < qty_needed:
                shortfalls[rtype] = qty_needed - assigned

        # ── Overall confidence ────────────────────────────────────────────
        if assignments:
            avg_conf       = sum(a.confidence for a in assignments) / len(assignments)
            total_demand   = max(sum(demand.values()), 1)
            shortfall_pct  = sum(shortfalls.values()) / total_demand
            overall_conf   = avg_conf * (1.0 - shortfall_pct * 0.5)
        else:
            overall_conf = 0.0

        return AllocationResponse(
            incidentId=request.incidentId,
            simulationResultId=request.simulationResultId,
            strategyUsed=f"DEMAND_DRIVEN_{tier}",
            assignments=assignments,
            totalResources=len(assignments),
            confidence=round(overall_conf, 3),
            expiresInMinutes=30,
            severityTier=SeverityTier(tier),
            severityScore=severity_score,
            demandMatrix=demand,
            shortfalls=shortfalls,
        )

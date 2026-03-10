# solver/allocation_solver.py
# Simple greedy allocation solver to satisfy unit tests.
# In a full implementation this would use OR-Tools CP-SAT, LP relaxations,
# genetic algorithms, etc. For now we assign each resource to the highest-
# risk node in forecastT2h (falling back to riskMap) and report a confidence.

from typing import List
from models import (
    AllocationRequest, AllocationResponse,
    ResourceAssignmentOutput, AssignmentPriority,
)
from graph.city_graph import CityGraph


class AllocationSolver:
    def __init__(self, graph: CityGraph):
        self.graph = graph

    def solve(self, request: AllocationRequest) -> AllocationResponse:
        # rebuild the graph from the request each time
        self.graph.build(request.graph)

        # if there is no risk data, return an empty plan
        if not request.riskMap and not request.forecastT2h:
            return AllocationResponse(
                incidentId=request.incidentId,
                simulationResultId=request.simulationResultId,
                strategyUsed="NONE",
                assignments=[],
                totalResources=0,
                confidence=1.0,
            )

        # choose scoring map: prefer forecastT2h (near-term risk)
        score_map = request.forecastT2h if request.forecastT2h else request.riskMap

        # sort nodes descending by score
        sorted_nodes = sorted(score_map.items(), key=lambda x: -x[1])

        assignments: List[ResourceAssignmentOutput] = []

        for resource in request.resources:
            if not sorted_nodes:
                break
            node_id, node_risk = sorted_nodes.pop(0)

            # find route and eta using graph
            path, eta = self.graph.shortest_path(resource.currentNodeId or "", node_id)

            # determine priority based on risk level
            if node_risk > 0.8:
                priority = AssignmentPriority.CRITICAL
            elif node_risk > 0.5:
                priority = AssignmentPriority.HIGH
            else:
                priority = AssignmentPriority.NORMAL

            assignments.append(ResourceAssignmentOutput(
                resourceId=resource.id,
                resourceLabel=resource.label,
                fromNodeId=resource.currentNodeId or "",
                toNodeId=node_id,
                routeNodeIds=path,
                etaMinutes=eta,
                priority=priority,
                confidence=round(node_risk, 2),
            ))

        total = len(assignments)
        confidence_score = 0.75 if total > 0 else 0.0

        return AllocationResponse(
            incidentId=request.incidentId,
            simulationResultId=request.simulationResultId,
            strategyUsed="GREEDY",
            assignments=assignments,
            totalResources=total,
            confidence=confidence_score,
        )

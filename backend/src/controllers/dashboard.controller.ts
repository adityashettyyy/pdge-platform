import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../config/db";
import { asyncHandler } from "../middleware/error";

export const getKPIs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;

  const [
    activeIncidents, verifiedIncidents,
    resourcesDeployed, resourcesAvailable,
    simulationsRun, plansAwaitingApproval,
  ] = await Promise.all([
    prisma.incident.count({ where: { organizationId: orgId, status: { in: ["ACTIVE","VERIFIED"] } } }),
    prisma.incident.count({ where: { organizationId: orgId, status: "VERIFIED" } }),
    prisma.resource.count({ where: { organizationId: orgId, status: { in: ["DEPLOYED","TRANSIT"] } } }),
    prisma.resource.count({ where: { organizationId: orgId, status: "IDLE" } }),
    prisma.simulationResult.count({ where: { incident: { organizationId: orgId } } }),
    prisma.allocationPlan.count({
      where: { simulationResult: { incident: { organizationId: orgId } }, status: { in: ["GENERATED","PENDING_APPROVAL"] } },
    }),
  ]);

  // Real avg response time from minimum ETA across approved plans
  const approvedPlans = await prisma.allocationPlan.findMany({
    where: { status: "APPROVED", simulationResult: { incident: { organizationId: orgId } } },
    include: { assignments: { select: { etaMinutes: true } } },
  });
  const etas = approvedPlans
    .map(p => p.assignments.length > 0 ? Math.min(...p.assignments.map(a => a.etaMinutes)) : null)
    .filter((e): e is number => e !== null && isFinite(e) && e > 0);
  const avgResponseTimeMin = etas.length > 0
    ? parseFloat((etas.reduce((a, b) => a + b, 0) / etas.length).toFixed(1))
    : null;

  res.json({
    success: true,
    data: { activeIncidents, verifiedIncidents, resourcesDeployed, resourcesAvailable, avgResponseTimeMin, simulationsRun, plansAwaitingApproval },
  });
});
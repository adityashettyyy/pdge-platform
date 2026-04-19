import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../config/db";

export const getKPIs = async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;
  const [activeIncidents, verifiedIncidents, resourcesDeployed, resourcesAvailable, simulationsRun, plansAwaitingApproval] = await Promise.all([
    prisma.incident.count({ where: { organizationId: orgId, status: { in: ["ACTIVE", "VERIFIED"] } } }),
    prisma.incident.count({ where: { organizationId: orgId, status: "VERIFIED" } }),
    prisma.resource.count({ where: { organizationId: orgId, status: { in: ["DEPLOYED", "TRANSIT"] } } }),
    prisma.resource.count({ where: { organizationId: orgId, status: "IDLE" } }),
    prisma.simulationResult.count({ where: { incident: { organizationId: orgId } } }),
    prisma.allocationPlan.count({ where: { simulationResult: { incident: { organizationId: orgId } }, status: { in: ["GENERATED", "PENDING_APPROVAL"] } } }),
  ]);
  res.json({ success: true, data: { activeIncidents, verifiedIncidents, resourcesDeployed, resourcesAvailable, avgResponseTimeMin: 7.2, simulationsRun, plansAwaitingApproval } });
};

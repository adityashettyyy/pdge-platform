import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../config/db";
import { PlanStatus } from "@prisma/client";
import { digitalTwinService } from "../services/digital-twin.service";

export const getPlans = async (req: AuthRequest, res: Response) => {
  const plans = await prisma.allocationPlan.findMany({
    where: { simulationResult: { incident: { organizationId: req.user!.organizationId } } },
    include: { assignments: { include: { resource: true } } },
    orderBy: { createdAt: "desc" }, take: 20,
  });
  res.json({ success: true, data: plans });
};

export const approvePlan = async (req: AuthRequest, res: Response) => {
  const plan = await prisma.allocationPlan.update({
    where: { id: req.params.id },
    data: { status: PlanStatus.APPROVED, humanApproved: true, approvedById: req.user!.id, approvedAt: new Date() },
    include: { assignments: { include: { resource: true } } },
  });
  await prisma.auditLog.create({
    data: { userId: req.user!.id, action: "PLAN_APPROVED", entity: "AllocationPlan", entityId: plan.id, details: { totalResources: plan.totalResources } as any },
  });
  digitalTwinService.emit("ALLOCATION_APPROVED", { planId: plan.id, assignments: plan.assignments });
  res.json({ success: true, data: plan });
};

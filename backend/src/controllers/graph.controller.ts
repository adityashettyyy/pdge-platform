import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../config/db";
import { asyncHandler } from "../middleware/error";
import { EdgeStatus } from "@prisma/client";

export const getNodes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const nodes = await prisma.graphNode.findMany({ where: { organizationId: req.user!.organizationId, isActive: true } });
  res.json({ success: true, data: nodes });
});

export const getEdges = asyncHandler(async (req: AuthRequest, res: Response) => {
  const edges = await prisma.graphEdge.findMany({ where: { organizationId: req.user!.organizationId } });
  res.json({ success: true, data: edges });
});

export const getSnapshot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;
  const [nodes, edges] = await Promise.all([
    prisma.graphNode.findMany({ where: { organizationId: orgId, isActive: true } }),
    prisma.graphEdge.findMany({ where: { organizationId: orgId } }),
  ]);
  const riskMap: Record<string, number> = {};
  for (const n of nodes) riskMap[n.id] = n.disasterRisk;
  res.json({ success: true, data: { nodes, edges, riskMap } });
});

export const blockEdge = asyncHandler(async (req: AuthRequest, res: Response) => {
  const edge = await prisma.graphEdge.update({
    where: { id: req.params.id },
    data: { status: EdgeStatus.BLOCKED, blockedReason: req.body.reason ?? "Manual block" },
  });
  res.json({ success: true, data: edge });
});
import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../config/db";

export const getResources = async (req: AuthRequest, res: Response) => {
  const resources = await prisma.resource.findMany({
    where: { organizationId: req.user!.organizationId, isActive: true },
    include: { currentNode: true },
  });
  res.json({ success: true, data: resources });
};

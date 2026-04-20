import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { prisma } from "../config/db";

const DEDUP_WINDOW_MS = 5 * 60_000; // 5 minutes

export const deduplicateReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const incidentId = req.params.id;
  if (!incidentId) { next(); return; }

  const userId = req.user?.id;
  const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS);

  // Check if this user already submitted a report for this incident in the last 5 min
  const recentReport = await prisma.trustScore.findFirst({
    where: {
      incidentId,
      createdAt: { gte: windowStart },
      // Match by reporter position if available (same GPS coords = duplicate device)
      ...(req.body?.latitude && req.body?.longitude ? {
        reporterLat: { gte: req.body.latitude - 0.001, lte: req.body.latitude + 0.001 },
        reporterLng: { gte: req.body.longitude - 0.001, lte: req.body.longitude + 0.001 },
      } : {}),
    },
  });

  if (recentReport) {
    res.status(429).json({
      error: "Duplicate report",
      message: "A report from your location for this incident was already submitted within the last 5 minutes.",
      cooldownUntil: new Date(recentReport.createdAt.getTime() + DEDUP_WINDOW_MS).toISOString(),
    });
    return;
  }

  next();
};
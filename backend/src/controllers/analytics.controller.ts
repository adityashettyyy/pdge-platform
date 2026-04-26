import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../config/db";
import { asyncHandler } from "../middleware/error";

export const getMonthlyStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  const stats = [];
  for (let i = 5; i >= 0; i--) {
    const d    = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const [incidents, resolved] = await Promise.all([
      prisma.incident.count({ where: { organizationId: orgId, createdAt: { gte: d, lt: next } } }),
      prisma.incident.count({ where: { organizationId: orgId, status: "CLOSED", closedAt: { gte: d, lt: next } } }),
    ]);
    const plans = await prisma.allocationPlan.findMany({
      where: {
        status: "APPROVED",
        approvedAt: { gte: d, lt: next },
        simulationResult: { incident: { organizationId: orgId } },
      },
      include: { assignments: { select: { etaMinutes: true } } },
    });
    const etas = plans
      .filter(p => p.assignments.length > 0)
      .map(p => Math.min(...p.assignments.map(a => a.etaMinutes).filter(e => e > 0)))
      .filter(e => isFinite(e) && e > 0);
    const avgResponseTime = etas.length > 0
      ? parseFloat((etas.reduce((a, b) => a + b, 0) / etas.length).toFixed(1))
      : null;
    stats.push({ month: months[d.getMonth()], incidents, resolved, avgResponseTime });
  }
  res.json({ success: true, data: stats });
});

export const getZoneResponseTimes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;
  const zones = await prisma.graphNode.findMany({
    where: { organizationId: orgId, type: "ZONE" },
    select: { id: true, label: true },
  });
  const data = await Promise.all(zones.map(async zone => {
    const assignments = await prisma.resourceAssignment.findMany({
      where: { toNodeId: zone.id },
      select: { etaMinutes: true },
    });
    const etas = assignments.map(a => a.etaMinutes).filter(e => e > 0);
    const avgMinutes = etas.length > 0
      ? parseFloat((etas.reduce((a, b) => a + b, 0) / etas.length).toFixed(1))
      : null;
    return { zone: zone.label, avgMinutes, sampleCount: etas.length };
  }));
  // Return ALL zones — frontend shows "no data" for null ones rather than hiding them
  res.json({ success: true, data });
});

export const getDisasterTypeStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;
  const incidents = await prisma.incident.findMany({
    where: { organizationId: orgId },
    select: { type: true },
  });
  const counts: Record<string, number> = {};
  for (const i of incidents) counts[i.type] = (counts[i.type] ?? 0) + 1;
  const total = incidents.length || 1;
  const data = Object.entries(counts).map(([type, count]) => ({
    type,
    count,
    percentage: Math.round((count / total) * 100),
  }));
  res.json({ success: true, data });
});

export const getPerformanceKPIs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;
  const allApprovedPlans = await prisma.allocationPlan.findMany({
    where: { status: "APPROVED", simulationResult: { incident: { organizationId: orgId } } },
    include: { assignments: { select: { etaMinutes: true } } },
  });
  const allEtas = allApprovedPlans
    .filter(p => p.assignments.length > 0)
    .map(p => {
      const validEtas = p.assignments.map(a => a.etaMinutes).filter(e => e > 0);
      return validEtas.length > 0 ? Math.min(...validEtas) : null;
    })
    .filter((e): e is number => e !== null && isFinite(e));

  const avgResponse = allEtas.length > 0
    ? parseFloat((allEtas.reduce((a, b) => a + b, 0) / allEtas.length).toFixed(1))
    : null;

  // FIX: also count simulations that have accuracy from postmortem
  const sims = await prisma.simulationResult.findMany({
    where: { status: "COMPLETED", overallAccuracy: { not: null }, incident: { organizationId: orgId } },
    select: { overallAccuracy: true },
  });
  const accuracies = sims.map(s => s.overallAccuracy as number).filter(a => a >= 0);
  const avgAccuracy = accuracies.length > 0
    ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length * 100)
    : null;

  const TRADITIONAL_BASELINE = 18.0;
  res.json({
    success: true,
    data: {
      avgResponseMin: avgResponse,
      traditionalBaselineMin: TRADITIONAL_BASELINE,
      deltaMin: avgResponse ? parseFloat((TRADITIONAL_BASELINE - avgResponse).toFixed(1)) : null,
      deltaPercent: avgResponse ? Math.round(((TRADITIONAL_BASELINE - avgResponse) / TRADITIONAL_BASELINE) * 100) : null,
      avgPredictionAccuracy: avgAccuracy,
      totalApprovedPlans: allApprovedPlans.length,
      totalSimulations: sims.length,
    },
  });
});
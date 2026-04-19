import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../config/db";

export const getMonthlyStats = async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  const stats = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const [incidents, resolved] = await Promise.all([
      prisma.incident.count({ where: { organizationId: orgId, createdAt: { gte: d, lt: next } } }),
      prisma.incident.count({ where: { organizationId: orgId, status: "CLOSED", closedAt: { gte: d, lt: next } } }),
    ]);
    stats.push({ month: months[d.getMonth()], incidents, resolved, avgResponseTime: 7.2 });
  }
  res.json({ success: true, data: stats });
};

export const getZoneResponseTimes = async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;
  const nodes = await prisma.graphNode.findMany({ where: { organizationId: orgId, type: "ZONE" } });
  const data = nodes.map(n => ({ zone: n.label.replace(" (", "\n("), avgMinutes: 5 + Math.random() * 8 }));
  res.json({ success: true, data });
};

export const getDisasterTypeStats = async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId;
  const incidents = await prisma.incident.findMany({ where: { organizationId: orgId }, select: { type: true } });
  const counts: Record<string, number> = {};
  for (const i of incidents) counts[i.type] = (counts[i.type] ?? 0) + 1;
  const total = incidents.length || 1;
  const data = Object.entries(counts).map(([type, count]) => ({ type, count, percentage: Math.round((count / total) * 100) }));
  res.json({ success: true, data });
};

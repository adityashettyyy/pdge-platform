import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../config/db";
import { asyncHandler } from "../middleware/error";
import { queueService } from "../services/queue.service";
import { IncidentStatus } from "@prisma/client";

export const reportIncident = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { type, latitude, longitude, originNodeId, gpsValid, description } = req.body;
  const orgId = req.user!.organizationId;
  const incident = await prisma.incident.create({
    data: { type, latitude, longitude, originNodeId, description, organizationId: orgId, reportedById: req.user!.id },
  });
  const job = await queueService.enqueueTrustScore({
    incidentId: incident.id, organizationId: orgId,
    reportData: { incidentId: incident.id, organizationId: orgId, gpsValid: gpsValid ?? false, reporterLat: latitude, reporterLng: longitude, claimedNodeId: originNodeId },
  });
  res.status(202).json({ incidentId: incident.id, jobId: job.id, trustScore: 0, message: "Report queued for validation" });
});

export const addReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { gpsValid, latitude, longitude } = req.body;
  const incident = await prisma.incident.findUnique({ where: { id } });
  if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }
  const job = await queueService.enqueueTrustScore({
    incidentId: id, organizationId: req.user!.organizationId,
    reportData: { incidentId: id, organizationId: req.user!.organizationId, gpsValid: gpsValid ?? false, reporterLat: latitude, reporterLng: longitude },
  });
  res.status(202).json({ jobId: job.id });
});

export const getIncidents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const incidents = await prisma.incident.findMany({
    where: { organizationId: req.user!.organizationId },
    include: { originNode: true },
    orderBy: { createdAt: "desc" }, take: 50,
  });
  res.json({ success: true, data: incidents });
});

export const getIncident = asyncHandler(async (req: AuthRequest, res: Response) => {
  const inc = await prisma.incident.findUnique({ where: { id: req.params.id }, include: { originNode: true, trustScores: { orderBy: { createdAt: "asc" } }, simResults: { include: { allocationPlans: { include: { assignments: { include: { resource: true } } } } } } } });
  if (!inc) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true, data: inc });
});

export const closeIncident = asyncHandler(async (req: AuthRequest, res: Response) => {
  const inc = await prisma.incident.update({ where: { id: req.params.id }, data: { status: IncidentStatus.CLOSED, closedAt: new Date() } });
  await queueService.enqueueClose(inc.id);
  res.json({ success: true, data: inc });
});
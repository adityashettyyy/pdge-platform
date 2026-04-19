import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../config/db";

export const generateSitrep = async (req: AuthRequest, res: Response) => {
  const incident = await prisma.incident.findUnique({
    where: { id: req.params.id },
    include: { originNode: true, simResults: { orderBy: { createdAt: "desc" }, take: 1, include: { allocationPlans: { take: 1, include: { assignments: { include: { resource: true } } } } } } },
  });
  if (!incident) { res.status(404).json({ error: "Not found" }); return; }

  const sim = incident.simResults[0];
  const plan = sim?.allocationPlans[0];

  const prompt = `You are an emergency response AI. Generate a concise situation report.

INCIDENT: ${incident.type} at ${incident.originNode?.label ?? "Unknown location"}
STATUS: ${incident.status}
TRUST SCORE: ${incident.trustScore.toFixed(0)}/100
SEVERITY: ${sim?.severityTier ?? "ASSESSING"}
HIGH RISK NODES: ${sim ? Object.keys((sim.forecastT2h as any) ?? {}).filter(k => (sim.forecastT2h as any)[k] > 0.5).length : 0} zones affected
RESOURCES ASSIGNED: ${plan?.totalResources ?? 0}
STRATEGY: ${plan?.strategyUsed ?? "Pending"}

Write a 3-paragraph sitrep: (1) current situation, (2) predicted spread and risk, (3) recommended actions. Be specific and actionable.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await response.json() as any;
    const sitrep = data.content?.[0]?.text ?? "Unable to generate sitrep.";
    res.json({ success: true, data: { sitrep } });
  } catch (e: any) {
    res.json({ success: true, data: { sitrep: `Sitrep for ${incident.type} incident at ${incident.originNode?.label}. Trust score: ${incident.trustScore.toFixed(0)}. Status: ${incident.status}. Severity: ${sim?.severityTier ?? "assessing"}. ${plan?.totalResources ?? 0} resources assigned.` } });
  }
};

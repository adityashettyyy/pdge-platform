import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../config/db";
import { asyncHandler } from "../middleware/error";

export const generateSitrep = asyncHandler(async (req: AuthRequest, res: Response) => {
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

  const apiKey = process.env.GROQ_API_KEY;
  console.log("GROQ_API_KEY present:", !!apiKey, "| starts with:", apiKey?.slice(0, 8));

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json() as any;
  console.log("Groq response status:", response.status);
  console.log("Groq response body:", JSON.stringify(data).slice(0, 300));

  if (!response.ok) {
    res.status(500).json({ error: "Groq API error", detail: data });
    return;
  }

  const sitrep = data.choices?.[0]?.message?.content ?? "Unable to generate sitrep.";
  res.json({ success: true, data: { sitrep } });
});
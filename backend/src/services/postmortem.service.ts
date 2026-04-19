import { prisma } from "../config/db";
import { IncidentStatus } from "@prisma/client";
const EMA = 0.2;
const BASELINE = 18.0;

export class PostMortemService {
  async run(incidentId: string) {
    const inc = await prisma.incident.findUnique({ where: { id: incidentId }, include: { simResults: { orderBy: { createdAt: "desc" }, take: 1, include: { allocationPlans: { take: 1, include: { assignments: { select: { toNodeId: true, etaMinutes: true } } } } } } } });
    if (!inc || inc.status !== IncidentStatus.CLOSED) return;
    const sim = inc.simResults[0]; if (!sim || sim.status !== "COMPLETED") return;
    const forecast = (sim.forecastT2h as any) ?? {};
    const forecasted = Object.values(forecast as Record<string, number>).filter(r => r > 0.5).length;
    const plan = sim.allocationPlans[0];
    const actual = plan ? new Set(plan.assignments.map((a: any) => a.toNodeId)).size : forecasted;
    const err = forecasted > 0 ? Math.abs(forecasted - actual) / forecasted : 0;
    await prisma.simulationResult.update({ where: { id: sim.id }, data: { predictionErrorT2h: err, overallAccuracy: Math.max(0, 1 - err) } });
    const c = sim.spreadCoefficient;
    const correction = forecasted > actual * 1.3 ? c * 0.95 : forecasted < actual * 0.7 ? c * 1.05 : c;
    const newCoeff = Math.min(0.9, Math.max(0.1, (1 - EMA) * c + EMA * correction));
    await prisma.organization.update({ where: { id: inc.organizationId }, data: { metadata: { spreadCoefficient: newCoeff } as any } });
    const etas = plan?.assignments.map((a: any) => a.etaMinutes as number) ?? [];
    const pdge = etas.length > 0 ? Math.min(...etas) : null;
    console.log(`[PostMortem] ${incidentId} | Accuracy: ${((1 - err) * 100).toFixed(1)}% | Coeff: ${c.toFixed(3)}->${newCoeff.toFixed(3)} | Delta: ${pdge ? (BASELINE - pdge).toFixed(1) : "n/a"}min`);
  }
}
export const postMortemService = new PostMortemService();

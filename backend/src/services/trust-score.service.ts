import { prisma } from "../config/db";
import { TrustVerdict, IncidentStatus } from "@prisma/client";
import { TrustScoreInput, TrustScoreResult, TRUST_SCORE } from "../types";

export class TrustScoreService {
  async processReport(input: TrustScoreInput): Promise<TrustScoreResult> {
    const existingReports = await prisma.trustScore.count({ where: { incidentId: input.incidentId } });
    const breakdown = this.calcBreakdown(input, existingReports);
    const score = Math.min(100, Math.max(0, Object.values(breakdown).reduce((a, b) => a + b, 0)));
    const verdict = score >= TRUST_SCORE.VERIFIED_THRESHOLD ? TrustVerdict.VERIFIED
      : score >= TRUST_SCORE.ACCUMULATING_THRESHOLD ? TrustVerdict.ACCUMULATING
      : TrustVerdict.UNVERIFIED;

    await prisma.trustScore.create({
      data: { incidentId: input.incidentId, score, verdict, gpsValid: input.gpsValid,
        clusterCount: existingReports + 1, sensorData: input.sensorData as any,
        reporterLat: input.reporterLat, reporterLng: input.reporterLng, claimedNodeId: input.claimedNodeId },
    });
    await prisma.incident.update({
      where: { id: input.incidentId },
      data: { trustScore: score, reportCount: { increment: 1 },
        status: verdict === TrustVerdict.VERIFIED ? IncidentStatus.VERIFIED : undefined,
        verifiedAt: verdict === TrustVerdict.VERIFIED ? new Date() : undefined },
    });
    console.log(`[TrustScore] ${input.incidentId} | Score: ${score.toFixed(1)} | ${verdict}`);
    return { score, verdict, isVerified: verdict === TrustVerdict.VERIFIED, breakdown };
  }

  private calcBreakdown(input: TrustScoreInput, existing: number) {
    return {
      baseScore: TRUST_SCORE.BASE,
      gpsBonus: input.gpsValid ? TRUST_SCORE.GPS_BONUS : 0,
      clusterBonus: Math.min(existing * TRUST_SCORE.CLUSTER_BONUS_PER_REPORT, TRUST_SCORE.CLUSTER_BONUS_MAX),
      sensorBonus: this.evalSensor(input) ? TRUST_SCORE.SENSOR_BONUS : 0,
    };
  }
  private evalSensor(input: TrustScoreInput): boolean {
    if (!input.sensorData) return false;
    const { accelerometerSpike, soundLevel, pressureDrop } = input.sensorData as any;
    return !!(accelerometerSpike || soundLevel > 80 || pressureDrop);
  }
}
export const trustScoreService = new TrustScoreService();

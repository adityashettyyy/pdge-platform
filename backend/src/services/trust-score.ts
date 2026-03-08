// src/services/trust-score.ts
// The TrustScoreEngine — Bayesian report validation.
//
// HOW TO TEST STANDALONE (before wiring to any route):
//   npx ts-node src/services/__tests__/trust-score.test.ts
//
// WHAT IT DOES:
//   1. Receives a raw disaster report
//   2. Computes a Bayesian trust score (0–100)
//   3. Updates the Incident's trustScore in DB
//   4. If score >= 70, marks Incident as VERIFIED
//   5. Emits an event so the queue can trigger simulation

import { prisma } from "../config/db";
import { TrustVerdict, IncidentStatus } from "@prisma/client";
import { TrustScoreInput, TrustScoreResult, TRUST_SCORE } from "../types";

export class TrustScoreService {
  // ─────────────────────────────────────────────────────
  // Main entry point — call this for every new report
  // ─────────────────────────────────────────────────────
  async processReport(input: TrustScoreInput): Promise<TrustScoreResult> {
    // Step 1: Count existing verified reports for this incident
    const existingReports = await prisma.trustScore.count({
      where: { incidentId: input.incidentId },
    });

    // Step 2: Calculate the score components
    const breakdown = this._calculateBreakdown(input, existingReports);
    const totalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const clampedScore = Math.min(100, Math.max(0, totalScore));

    // Step 3: Determine verdict
    const verdict = this._getVerdict(clampedScore);

    // Step 4: Save this TrustScore record to DB
    await prisma.trustScore.create({
      data: {
        incidentId: input.incidentId,
        score: clampedScore,
        verdict: verdict,
        gpsValid: input.gpsValid,
        clusterCount: existingReports + 1,
        sensorData: input.sensorData as any,
        reporterLat: input.reporterLat,
        reporterLng: input.reporterLng,
        claimedNodeId: input.claimedNodeId,
        distanceToNode:
          input.reporterLat && input.reporterLng && input.claimedNodeId
            ? await this._distanceToNode(input)
            : undefined,
      },
    });

    // Step 5: Update the Incident's trustScore and status
    const incident = await prisma.incident.update({
      where: { id: input.incidentId },
      data: {
        trustScore: clampedScore,
        reportCount: { increment: 1 },
        status:
          verdict === TrustVerdict.VERIFIED
            ? IncidentStatus.VERIFIED
            : undefined,
        verifiedAt: verdict === TrustVerdict.VERIFIED ? new Date() : undefined,
      },
    });

    console.log(
      `[TrustScore] Incident ${input.incidentId} | ` +
        `Score: ${clampedScore.toFixed(1)} | ` +
        `Verdict: ${verdict} | ` +
        `Reports: ${existingReports + 1}`,
    );

    return {
      score: clampedScore,
      verdict: verdict,
      breakdown: breakdown,
      isVerified: verdict === TrustVerdict.VERIFIED,
    };
  }

  // ─────────────────────────────────────────────────────
  // Get current score for an incident (without adding a report)
  // ─────────────────────────────────────────────────────
  async getCurrentScore(incidentId: string): Promise<number> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      select: { trustScore: true },
    });
    return incident?.trustScore ?? 0;
  }

  // ─────────────────────────────────────────────────────
  // Check if an incident is verified
  // ─────────────────────────────────────────────────────
  async isVerified(incidentId: string): Promise<boolean> {
    const score = await this.getCurrentScore(incidentId);
    return score >= TRUST_SCORE.VERIFIED_THRESHOLD;
  }

  // ─────────────────────────────────────────────────────
  // Get all trust score records for an incident
  // (used by the dashboard to show the scoring history)
  // ─────────────────────────────────────────────────────
  async getHistory(incidentId: string) {
    return prisma.trustScore.findMany({
      where: { incidentId },
      orderBy: { createdAt: "asc" },
    });
  }

  // ─────────────────────────────────────────────────────
  // PRIVATE — Score breakdown calculation
  // This is the Bayesian logic. Each factor is additive.
  // ─────────────────────────────────────────────────────
  private _calculateBreakdown(
    input: TrustScoreInput,
    existingReports: number,
  ): TrustScoreResult["breakdown"] {
    // Base: every report gets 30 points just for being submitted
    const baseScore = TRUST_SCORE.BASE;

    // GPS bonus: +25 if reporter is physically near the claimed node
    const gpsBonus = input.gpsValid ? TRUST_SCORE.GPS_BONUS : 0;

    // Cluster bonus: +15 per corroborating report, max +45
    // This is the Bayesian update — independent confirmation raises credibility
    const clusterBonus = Math.min(
      existingReports * TRUST_SCORE.CLUSTER_BONUS_PER_REPORT,
      TRUST_SCORE.CLUSTER_BONUS_MAX,
    );

    // Sensor bonus: +10 if device sensor corroborates (e.g. accelerometer for quake)
    const sensorBonus = this._evaluateSensorData(input)
      ? TRUST_SCORE.SENSOR_BONUS
      : 0;

    return { baseScore, gpsBonus, clusterBonus, sensorBonus };
  }

  // ─────────────────────────────────────────────────────
  // PRIVATE — Convert score to verdict
  // ─────────────────────────────────────────────────────
  private _getVerdict(score: number): TrustVerdict {
    if (score >= TRUST_SCORE.VERIFIED_THRESHOLD) return TrustVerdict.VERIFIED;
    if (score >= TRUST_SCORE.ACCUMULATING_THRESHOLD)
      return TrustVerdict.ACCUMULATING;
    return TrustVerdict.UNVERIFIED;
  }

  // ─────────────────────────────────────────────────────
  // PRIVATE — Evaluate sensor data for corroboration
  // In production: integrate with device sensor APIs.
  // For now: check if sensorData contains useful signals.
  // ─────────────────────────────────────────────────────
  private _evaluateSensorData(input: TrustScoreInput): boolean {
    if (!input.sensorData) return false;
    const { accelerometerSpike, soundLevel, pressureDrop } =
      input.sensorData as any;
    return !!(accelerometerSpike || soundLevel > 80 || pressureDrop);
  }

  // ─────────────────────────────────────────────────────
  // PRIVATE — Calculate distance from reporter to claimed node
  // Haversine formula — returns distance in metres
  // ─────────────────────────────────────────────────────
  private async _distanceToNode(
    input: TrustScoreInput,
  ): Promise<number | null> {
    if (!input.claimedNodeId || !input.reporterLat || !input.reporterLng)
      return null;

    const node = await prisma.graphNode.findUnique({
      where: { id: input.claimedNodeId },
      select: { latitude: true, longitude: true },
    });
    if (!node) return null;

    return this._haversineMetres(
      input.reporterLat,
      input.reporterLng,
      node.latitude,
      node.longitude,
    );
  }

  private _haversineMetres(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371000; // Earth radius in metres
    const dLat = this._toRad(lat2 - lat1);
    const dLng = this._toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this._toRad(lat1)) *
        Math.cos(this._toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private _toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

// Export singleton instance
export const trustScoreService = new TrustScoreService();

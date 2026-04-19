export const QUEUE_NAMES = {
  TRUST_SCORE: "trust-score",
  SIMULATION: "simulation",
  INCIDENT_CLOSE: "incident-close",
} as const;

export const TRUST_SCORE = {
  BASE: 30,
  GPS_BONUS: 25,
  CLUSTER_BONUS_PER_REPORT: 15,
  CLUSTER_BONUS_MAX: 45,
  SENSOR_BONUS: 10,
  VERIFIED_THRESHOLD: 70,
  ACCUMULATING_THRESHOLD: 40,
} as const;

export interface TrustScoreInput {
  incidentId: string;
  organizationId: string;
  gpsValid: boolean;
  reporterLat?: number;
  reporterLng?: number;
  claimedNodeId?: string;
  sensorData?: Record<string, unknown>;
}

export interface TrustScoreResult {
  score: number;
  verdict: string;
  isVerified: boolean;
  breakdown: {
    baseScore: number;
    gpsBonus: number;
    clusterBonus: number;
    sensorBonus: number;
  };
}

export interface TrustScoreJobPayload {
  incidentId: string;
  organizationId: string;
  reportData: TrustScoreInput;
}

export interface SimulationJobPayload {
  incidentId: string;
  organizationId: string;
  originNodeId: string;
  disasterType: string;
}

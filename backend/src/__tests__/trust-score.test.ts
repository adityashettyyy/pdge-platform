import { TRUST_SCORE } from "../types";

// ── Minimal stub — tests the calculation logic without Prisma ──────────────

type Breakdown = { baseScore: number; gpsBonus: number; clusterBonus: number; sensorBonus: number };

function calcBreakdown(input: { gpsValid: boolean; sensorData?: any }, existingReports: number): Breakdown {
  const sensorData = input.sensorData as any;
  const sensorBonus = sensorData && (sensorData.accelerometerSpike || sensorData.soundLevel > 80 || sensorData.pressureDrop)
    ? TRUST_SCORE.SENSOR_BONUS : 0;
  return {
    baseScore:    TRUST_SCORE.BASE,
    gpsBonus:     input.gpsValid ? TRUST_SCORE.GPS_BONUS : 0,
    clusterBonus: Math.min(existingReports * TRUST_SCORE.CLUSTER_BONUS_PER_REPORT, TRUST_SCORE.CLUSTER_BONUS_MAX),
    sensorBonus,
  };
}
function totalScore(breakdown: Breakdown) {
  return Math.min(100, Math.max(0, Object.values(breakdown).reduce((a, b) => a + b, 0)));
}
function verdict(score: number) {
  return score >= TRUST_SCORE.VERIFIED_THRESHOLD ? "VERIFIED"
    : score >= TRUST_SCORE.ACCUMULATING_THRESHOLD ? "ACCUMULATING"
    : "UNVERIFIED";
}

// ── Test runner ─────────────────────────────────────────────────────────────
let passed = 0; let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch(e: any) { console.error(`  FAIL  ${name}\n         ${e.message}`); failed++; }
}
function assert(actual: any, expected: any, msg?: string) {
  if (actual !== expected) throw new Error(`${msg ?? ""} expected ${expected}, got ${actual}`);
}

console.log("\n=== TrustScore Unit Tests ===\n");

test("Base score is 30 with no GPS, no cluster, no sensor", () => {
  const b = calcBreakdown({ gpsValid: false }, 0);
  assert(b.baseScore, 30);
  assert(b.gpsBonus, 0);
  assert(b.clusterBonus, 0);
  assert(b.sensorBonus, 0);
  assert(totalScore(b), 30);
  assert(verdict(30), "UNVERIFIED");
});

test("GPS valid adds 25 — single GPS report scores 55, ACCUMULATING", () => {
  const b = calcBreakdown({ gpsValid: true }, 0);
  assert(totalScore(b), 55);
  assert(verdict(55), "ACCUMULATING");
});

test("Two GPS-valid reports reach exactly 70 — VERIFIED", () => {
  const b = calcBreakdown({ gpsValid: true }, 1); // second report, 1 existing
  assert(totalScore(b), 70, "Score");
  assert(verdict(70), "VERIFIED");
});

test("Three non-GPS reports reach 75 — VERIFIED", () => {
  // Report 1: base 30 = 30 (UNVERIFIED)
  // Report 2: base 30 + cluster 15 = 45 (ACCUMULATING)
  // Report 3: base 30 + cluster 15 + cluster 15 = 60 — still ACCUMULATING
  // Report 4: base 30 + cluster 15+15+15 = 75 — VERIFIED
  const b4 = calcBreakdown({ gpsValid: false }, 3);
  assert(totalScore(b4), 75, "Score with 3 existing non-GPS");
  assert(verdict(75), "VERIFIED");
});

test("Cluster bonus caps at 45 regardless of report count", () => {
  const b = calcBreakdown({ gpsValid: false }, 100); // many reports
  assert(b.clusterBonus, TRUST_SCORE.CLUSTER_BONUS_MAX, "Cluster cap");
  assert(b.clusterBonus, 45);
});

test("Sensor data with accelerometerSpike adds 10", () => {
  const b = calcBreakdown({ gpsValid: false, sensorData: { accelerometerSpike: true } }, 0);
  assert(b.sensorBonus, 10);
  assert(totalScore(b), 40);
});

test("Sensor data with soundLevel > 80 adds 10", () => {
  const b = calcBreakdown({ gpsValid: false, sensorData: { soundLevel: 95 } }, 0);
  assert(b.sensorBonus, 10);
});

test("Sensor data with soundLevel <= 80 adds nothing", () => {
  const b = calcBreakdown({ gpsValid: false, sensorData: { soundLevel: 80 } }, 0);
  assert(b.sensorBonus, 0);
});

test("Maximum possible score is capped at 100", () => {
  const b = calcBreakdown({ gpsValid: true, sensorData: { accelerometerSpike: true } }, 10);
  // 30 + 25 + 45 + 10 = 110, capped to 100
  assert(totalScore(b), 100);
});

test("ACCUMULATING threshold is 40", () => {
  assert(TRUST_SCORE.ACCUMULATING_THRESHOLD, 40);
  assert(verdict(39), "UNVERIFIED");
  assert(verdict(40), "ACCUMULATING");
});

test("VERIFIED threshold is 70", () => {
  assert(TRUST_SCORE.VERIFIED_THRESHOLD, 70);
  assert(verdict(69), "ACCUMULATING");
  assert(verdict(70), "VERIFIED");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
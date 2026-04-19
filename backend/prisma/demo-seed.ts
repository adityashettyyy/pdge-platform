// prisma/demo-seed.ts
// Run AFTER normal seed to load a pre-built demo scenario.
// Creates one incident already at trust score 68 (just below threshold)
// so the teacher can push it over live with one more report.
// Run: npx ts-node -r dotenv/config prisma/demo-seed.ts

import { PrismaClient, DisasterType, IncidentStatus, TrustVerdict, ResourceStatus } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Loading demo scenario...");

  const org = await prisma.organization.findFirst({ where: { slug: "mumbai-ndrf" } });
  if (!org) { console.error("Run seed.ts first"); process.exit(1); }

  // Create a flood incident at Zone Beta, partially verified
  const incident = await prisma.incident.create({
    data: {
      organizationId: org.id,
      type: DisasterType.FLOOD,
      status: IncidentStatus.UNVERIFIED,
      originNodeId: "node-zone-beta",
      latitude: 19.072,
      longitude: 72.880,
      trustScore: 68,
      reportCount: 2,
      description: "Heavy rainfall causing water logging at Zone Beta (Kurla). Road access partially blocked.",
    },
  });

  // Two trust score records (simulating 2 reports already submitted)
  await prisma.trustScore.createMany({
    data: [
      { incidentId: incident.id, score: 30, verdict: TrustVerdict.UNVERIFIED,  gpsValid: false, clusterCount: 1 },
      { incidentId: incident.id, score: 55, verdict: TrustVerdict.ACCUMULATING, gpsValid: true,  clusterCount: 2 },
    ],
  });

  // Update node risk to show partial spread already
  await prisma.graphNode.updateMany({ where: { id: "node-zone-beta" }, data: { disasterRisk: 0.6 } });
  await prisma.graphNode.updateMany({ where: { id: "node-chk-1" },     data: { disasterRisk: 0.3 } });
  await prisma.graphNode.updateMany({ where: { id: "node-hosp-m" },    data: { disasterRisk: 0.2 } });

  // Mark two ambulances as already deployed elsewhere (shows resource pressure)
  await prisma.resource.updateMany({ where: { id: { in: ["res-amb-03","res-amb-04"] } }, data: { status: ResourceStatus.DEPLOYED, targetNodeId: "node-zone-d" } });

  console.log(`✓ Demo incident created: ${incident.id}`);
  console.log(`  Type: FLOOD | Location: Zone Beta (Kurla)`);
  console.log(`  Trust score: 68/100 (need 70 to trigger simulation)`);
  console.log(`  2 resources already deployed`);
  console.log(`\n→ Submit ONE more GPS-valid report to push score to 85+ and trigger full loop`);
  console.log(`  Incident ID: ${incident.id}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

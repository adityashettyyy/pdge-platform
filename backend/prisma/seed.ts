// prisma/seed.ts
// Complete Mumbai NDRF seed — 12 nodes, 20 roads (40 directed edges),
// 10 resources, 2 users. Population data is required for the severity classifier.
//
// Run: npx ts-node prisma/seed.ts
// Re-run safely — all operations are idempotent.

import {
  PrismaClient,
  NodeType, EdgeStatus,
  ResourceType, ResourceStatus, Role,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding PDGE database…");

  // ── Organisation ──────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where:  { slug: "mumbai-ndrf" },
    update: {},
    create: { name: "Mumbai NDRF District", slug: "mumbai-ndrf", tier: "ENTERPRISE" },
  });
  console.log("✓ Organisation:", org.name);

  // ── Users ─────────────────────────────────────────────────────────────────
  const [adminHash, opHash] = await Promise.all([
    bcrypt.hash("admin123",    10),
    bcrypt.hash("operator123", 10),
  ]);

  await prisma.user.upsert({
    where:  { email: "admin@pdge.local" },
    update: {},
    create: {
      email: "admin@pdge.local", passwordHash: adminHash,
      name: "Admin", role: Role.ADMIN, organizationId: org.id,
    },
  });
  await prisma.user.upsert({
    where:  { email: "operator@pdge.local" },
    update: {},
    create: {
      email: "operator@pdge.local", passwordHash: opHash,
      name: "Operator", role: Role.OPERATOR, organizationId: org.id,
    },
  });
  console.log("✓ Users: admin@pdge.local / admin123 | operator@pdge.local / operator123");

  // ── Graph nodes ───────────────────────────────────────────────────────────
  // population is required for severity classifier scoring
  const nodeData = [
    { id: "node-depot-n",   label: "North Depot",         type: NodeType.DEPOT,       lat: 19.1200, lng: 72.8650, pop:     0, cap: 200 },
    { id: "node-depot-s",   label: "South Depot",         type: NodeType.DEPOT,       lat: 18.9400, lng: 72.8350, pop:     0, cap: 200 },
    { id: "node-hosp-m",    label: "Municipal Hospital",  type: NodeType.HOSPITAL,    lat: 19.0450, lng: 72.8620, pop:   500, cap: 400 },
    { id: "node-hosp-k",    label: "KEM Hospital",        type: NodeType.HOSPITAL,    lat: 18.9900, lng: 72.8340, pop:   700, cap: 600 },
    { id: "node-shelter-a", label: "Shelter Alpha",       type: NodeType.SHELTER,     lat: 19.0600, lng: 72.8400, pop:   200, cap: 500 },
    { id: "node-shelter-b", label: "Shelter Bravo",       type: NodeType.SHELTER,     lat: 19.0100, lng: 72.8700, pop:   150, cap: 500 },
    { id: "node-zone-beta", label: "Zone Beta (Kurla)",   type: NodeType.ZONE,        lat: 19.0720, lng: 72.8800, pop: 48000, cap: 100 },
    { id: "node-zone-g",    label: "Zone G (Ghatkopar)",  type: NodeType.ZONE,        lat: 19.0860, lng: 72.9080, pop: 35000, cap: 100 },
    { id: "node-zone-d",    label: "Zone D (Dharavi)",    type: NodeType.ZONE,        lat: 19.0400, lng: 72.8580, pop: 62000, cap: 100 },
    { id: "node-zone-a",    label: "Zone A (Andheri)",    type: NodeType.ZONE,        lat: 19.1197, lng: 72.8464, pop: 41000, cap: 100 },
    { id: "node-zone-c",    label: "Zone C (Chembur)",    type: NodeType.ZONE,        lat: 19.0622, lng: 72.9005, pop: 29000, cap: 100 },
    { id: "node-chk-1",     label: "Checkpoint LBS Rd",  type: NodeType.CHECKPOINT,  lat: 19.0550, lng: 72.8720, pop:     0, cap:  50 },
  ];

  for (const n of nodeData) {
    await prisma.graphNode.upsert({
      where:  { id: n.id },
      update: { population: n.pop, label: n.label },
      create: {
        id: n.id, label: n.label, type: n.type,
        latitude: n.lat, longitude: n.lng,
        population: n.pop, capacity: n.cap,
        organizationId: org.id, disasterRisk: 0.0,
      },
    });
  }
  console.log(`✓ ${nodeData.length} graph nodes`);

  // ── Edges ─────────────────────────────────────────────────────────────────
  // Each road entry creates TWO directed edges (bidirectional).
  // Upsert key = @@unique([fromNodeId, toNodeId]) — fixes re-seed crash.
  const roads = [
    { from: "node-depot-n",   to: "node-zone-a",     w:  8.0 },
    { from: "node-depot-n",   to: "node-hosp-m",     w: 12.0 },
    { from: "node-depot-n",   to: "node-shelter-a",  w: 10.0 },
    { from: "node-hosp-m",    to: "node-zone-beta",  w:  7.0 },
    { from: "node-hosp-m",    to: "node-chk-1",      w:  4.0 },
    { from: "node-zone-beta", to: "node-zone-g",     w:  6.5 },
    { from: "node-zone-beta", to: "node-zone-d",     w:  5.0 },
    { from: "node-zone-beta", to: "node-chk-1",      w:  3.0 },
    { from: "node-zone-g",    to: "node-zone-c",     w:  7.5 },
    { from: "node-zone-d",    to: "node-hosp-k",     w:  9.0 },
    { from: "node-zone-d",    to: "node-shelter-b",  w:  6.0 },
    { from: "node-hosp-k",    to: "node-depot-s",    w: 11.0 },
    { from: "node-depot-s",   to: "node-shelter-b",  w:  8.0 },
    { from: "node-shelter-a", to: "node-zone-a",     w:  5.0 },
    { from: "node-zone-a",    to: "node-zone-g",     w:  9.0 },
    { from: "node-chk-1",     to: "node-zone-d",     w:  4.5 },
    { from: "node-zone-c",    to: "node-shelter-b",  w:  6.0 },
    { from: "node-zone-c",    to: "node-hosp-k",     w:  8.0 },
    { from: "node-zone-a",    to: "node-zone-beta",  w: 10.0 },
    { from: "node-zone-g",    to: "node-hosp-m",     w:  8.5 },
  ];

  let edgeCount = 0;
  for (const road of roads) {
    // Forward and reverse directions
    for (const [f, t] of [[road.from, road.to], [road.to, road.from]]) {
      await prisma.graphEdge.upsert({
        // ← FIXED: upsert by compound unique key, not by generated id
        where:  { fromNodeId_toNodeId: { fromNodeId: f, toNodeId: t } },
        update: { weight: road.w },
        create: {
          fromNodeId: f, toNodeId: t,
          weight: road.w, status: EdgeStatus.OPEN,
          organizationId: org.id,
        },
      });
      edgeCount++;
    }
  }
  console.log(`✓ ${edgeCount} directed edges (${roads.length} roads × 2)`);

  // ── Resources ─────────────────────────────────────────────────────────────
  const resourceData = [
    { id: "res-amb-01",  label: "AMB-01",   type: ResourceType.AMBULANCE,    node: "node-depot-n" },
    { id: "res-amb-02",  label: "AMB-02",   type: ResourceType.AMBULANCE,    node: "node-depot-n" },
    { id: "res-amb-03",  label: "AMB-03",   type: ResourceType.AMBULANCE,    node: "node-depot-s" },
    { id: "res-amb-04",  label: "AMB-04",   type: ResourceType.AMBULANCE,    node: "node-depot-s" },
    { id: "res-amb-05",  label: "AMB-05",   type: ResourceType.AMBULANCE,    node: "node-hosp-m"  },
    { id: "res-team-01", label: "TEAM-01",  type: ResourceType.RESCUE_TEAM,  node: "node-depot-n" },
    { id: "res-team-02", label: "TEAM-02",  type: ResourceType.RESCUE_TEAM,  node: "node-depot-s" },
    { id: "res-truck-01",label: "TRUCK-01", type: ResourceType.SUPPLY_TRUCK, node: "node-depot-n" },
    { id: "res-truck-02",label: "TRUCK-02", type: ResourceType.SUPPLY_TRUCK, node: "node-depot-s" },
    { id: "res-drone-01",label: "DRONE-01", type: ResourceType.DRONE,        node: "node-depot-n" },
  ];

  for (const r of resourceData) {
    await prisma.resource.upsert({
      where:  { id: r.id },
      update: { status: ResourceStatus.IDLE, currentNodeId: r.node },
      create: {
        id: r.id, label: r.label, type: r.type,
        status: ResourceStatus.IDLE, currentNodeId: r.node,
        organizationId: org.id,
      },
    });
  }
  console.log(`✓ ${resourceData.length} resources`);

  console.log("\nSeed complete.");
  console.log("Verify: npx prisma studio");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
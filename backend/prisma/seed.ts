import "dotenv/config";
import { PrismaClient, NodeType, EdgeStatus, ResourceType, ResourceStatus, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
const prisma = new PrismaClient();
async function main() {
  console.log("Seeding…");
  const org = await prisma.organization.upsert({ where: { slug: "mumbai-ndrf" }, update: {}, create: { name: "Mumbai NDRF District", slug: "mumbai-ndrf", tier: "ENTERPRISE" } });
  console.log("✓ Org:", org.name);
  await prisma.user.upsert({ where: { email: "admin@pdge.local" }, update: {}, create: { email: "admin@pdge.local", passwordHash: await bcrypt.hash("admin123", 10), name: "Admin", role: Role.ADMIN, organizationId: org.id } });
  await prisma.user.upsert({ where: { email: "operator@pdge.local" }, update: {}, create: { email: "operator@pdge.local", passwordHash: await bcrypt.hash("operator123", 10), name: "Operator", role: Role.OPERATOR, organizationId: org.id } });
  console.log("✓ Users: admin@pdge.local/admin123");
  const nodes = [
    { id: "node-depot-n",   label: "North Depot",        type: NodeType.DEPOT,       lat: 19.1200, lng: 72.8650, pop:     0, cap: 200 },
    { id: "node-depot-s",   label: "South Depot",        type: NodeType.DEPOT,       lat: 18.9400, lng: 72.8350, pop:     0, cap: 200 },
    { id: "node-hosp-m",    label: "Municipal Hospital", type: NodeType.HOSPITAL,    lat: 19.0450, lng: 72.8620, pop:   500, cap: 400 },
    { id: "node-hosp-k",    label: "KEM Hospital",       type: NodeType.HOSPITAL,    lat: 18.9900, lng: 72.8340, pop:   700, cap: 600 },
    { id: "node-shelter-a", label: "Shelter Alpha",      type: NodeType.SHELTER,     lat: 19.0600, lng: 72.8400, pop:   200, cap: 500 },
    { id: "node-shelter-b", label: "Shelter Bravo",      type: NodeType.SHELTER,     lat: 19.0100, lng: 72.8700, pop:   150, cap: 500 },
    { id: "node-zone-beta", label: "Zone Beta (Kurla)",  type: NodeType.ZONE,        lat: 19.0720, lng: 72.8800, pop: 48000, cap: 100 },
    { id: "node-zone-g",    label: "Zone G (Ghatkopar)", type: NodeType.ZONE,        lat: 19.0860, lng: 72.9080, pop: 35000, cap: 100 },
    { id: "node-zone-d",    label: "Zone D (Dharavi)",   type: NodeType.ZONE,        lat: 19.0400, lng: 72.8580, pop: 62000, cap: 100 },
    { id: "node-zone-a",    label: "Zone A (Andheri)",   type: NodeType.ZONE,        lat: 19.1197, lng: 72.8464, pop: 41000, cap: 100 },
    { id: "node-zone-c",    label: "Zone C (Chembur)",   type: NodeType.ZONE,        lat: 19.0622, lng: 72.9005, pop: 29000, cap: 100 },
    { id: "node-chk-1",     label: "Checkpoint LBS",     type: NodeType.CHECKPOINT,  lat: 19.0550, lng: 72.8720, pop:     0, cap:  50 },
  ];
  for (const n of nodes) await prisma.graphNode.upsert({ where: { id: n.id }, update: { population: n.pop, disasterRisk: 0 }, create: { id: n.id, label: n.label, type: n.type, latitude: n.lat, longitude: n.lng, population: n.pop, capacity: n.cap, organizationId: org.id, disasterRisk: 0 } });
  console.log(`✓ ${nodes.length} nodes`);
  const roads = [
    ["node-depot-n","node-zone-a",8],["node-depot-n","node-hosp-m",12],["node-depot-n","node-shelter-a",10],
    ["node-hosp-m","node-zone-beta",7],["node-hosp-m","node-chk-1",4],["node-zone-beta","node-zone-g",6.5],
    ["node-zone-beta","node-zone-d",5],["node-zone-beta","node-chk-1",3],["node-zone-g","node-zone-c",7.5],
    ["node-zone-d","node-hosp-k",9],["node-zone-d","node-shelter-b",6],["node-hosp-k","node-depot-s",11],
    ["node-depot-s","node-shelter-b",8],["node-shelter-a","node-zone-a",5],["node-zone-a","node-zone-g",9],
    ["node-chk-1","node-zone-d",4.5],["node-zone-c","node-shelter-b",6],["node-zone-c","node-hosp-k",8],
    ["node-zone-a","node-zone-beta",10],["node-zone-g","node-hosp-m",8.5],
  ];
  let ec = 0;
  for (const [f,t,w] of roads as any[]) {
    for (const [a,b] of [[f,t],[t,f]]) {
      await prisma.graphEdge.upsert({ where: { fromNodeId_toNodeId: { fromNodeId: a, toNodeId: b } }, update: { weight: w, status: EdgeStatus.OPEN }, create: { fromNodeId: a, toNodeId: b, weight: w, status: EdgeStatus.OPEN, organizationId: org.id } });
      ec++;
    }
  }
  console.log(`✓ ${ec} edges`);
  const resources = [
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
  for (const r of resources) await prisma.resource.upsert({ where: { id: r.id }, update: { status: ResourceStatus.IDLE, currentNodeId: r.node, targetNodeId: null, etaMinutes: null }, create: { id: r.id, label: r.label, type: r.type, status: ResourceStatus.IDLE, currentNodeId: r.node, organizationId: org.id } });
  console.log(`✓ ${resources.length} resources`);
  console.log("\n✅ Seed complete. Login: admin@pdge.local / admin123");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
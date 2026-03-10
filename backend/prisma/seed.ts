// prisma/seed.ts
// Seeds the database with 12 city nodes and all edges.
// Run: npx ts-node prisma/seed.ts
//
// This creates the city graph that PDGE operates on.
// Run once after your first migration.

import { PrismaClient } from '@prisma/client'
/// <reference types="node" />
declare var process: any;

import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('\n🌱 Seeding PDGE database...\n')

  // ─── Organization ───────────────────────────────────
  const org = await prisma.organization.upsert({
    where:  { slug: 'mumbai-ndrf' },
    update: {},
    create: { name: 'Mumbai NDRF District', slug: 'mumbai-ndrf', tier: 'ENTERPRISE' },
  })
  console.log(`✓ Organization: ${org.name}`)

  // ─── Users ──────────────────────────────────────────
  const passwordHash = await bcrypt.hash('password123', 12)

  const admin = await prisma.user.upsert({
    where:  { email: 'admin@pdge.local' },
    update: {},
    create: {
      email: 'admin@pdge.local',
      passwordHash,
      name:           'PDGE Admin',
      role:           'ADMIN',
      organizationId: org.id,
    },
  })

  const operator = await prisma.user.upsert({
    where:  { email: 'operator@pdge.local' },
    update: {},
    create: {
      email: 'operator@pdge.local',
      passwordHash,
      name:           'Ops Officer',
      role:           'OPERATOR',
      organizationId: org.id,
    },
  })
  console.log(`✓ Users: admin@pdge.local / operator@pdge.local (password: password123)`)

  // ─── 12 Graph Nodes ─────────────────────────────────
  // These map exactly to the city graph in the PDGE app.
  // Coordinates are representative Mumbai-area positions.
  console.log('\nCreating city graph nodes...')

  const nodeData = [
    // Depots (resource staging areas)
    { id: 'node-depot-north', label: 'Depot North',     type: 'DEPOT',    lat: 19.1500, lng: 72.8500, cap: 50,  pop: 0 },
    { id: 'node-depot-east',  label: 'Depot East',      type: 'DEPOT',    lat: 19.1200, lng: 72.9200, cap: 50,  pop: 0 },

    // Hospitals
    { id: 'node-hosp-gen',    label: 'General Hosp.',   type: 'HOSPITAL', lat: 19.1100, lng: 72.8400, cap: 200, pop: 0 },
    { id: 'node-hosp-metro',  label: 'Metro Hospital',  type: 'HOSPITAL', lat: 19.1300, lng: 72.8700, cap: 350, pop: 0 },
    { id: 'node-hosp-east',   label: 'East Hospital',   type: 'HOSPITAL', lat: 19.1100, lng: 72.9100, cap: 180, pop: 0 },

    // Zones (population areas — can become disaster origins)
    { id: 'node-zone-alpha',  label: 'Zone Alpha',      type: 'ZONE',     lat: 19.0900, lng: 72.8600, cap: 100, pop: 52000 },
    { id: 'node-zone-beta',   label: 'Zone Beta',       type: 'ZONE',     lat: 19.0800, lng: 72.8900, cap: 100, pop: 84000 },
    { id: 'node-zone-gamma',  label: 'Zone Gamma',      type: 'ZONE',     lat: 19.0700, lng: 72.8500, cap: 100, pop: 38000 },
    { id: 'node-zone-delta',  label: 'Zone Delta',      type: 'ZONE',     lat: 19.0700, lng: 72.9000, cap: 100, pop: 47000 },
    { id: 'node-city-centre', label: 'City Centre',     type: 'ZONE',     lat: 19.0600, lng: 72.8750, cap: 100, pop: 115000 },

    // Shelters (evacuation points)
    { id: 'node-shelter-w',   label: 'West Shelter',    type: 'SHELTER',  lat: 19.0600, lng: 72.8350, cap: 500, pop: 0 },
    { id: 'node-shelter-e',   label: 'East Shelter',    type: 'SHELTER',  lat: 19.0600, lng: 72.9200, cap: 400, pop: 0 },
  ]

  for (const n of nodeData) {
    await prisma.graphNode.upsert({
      where:  { id: n.id },
      update: { label: n.label, latitude: n.lat, longitude: n.lng },
      create: {
        id:             n.id,
        organizationId: org.id,
        label:          n.label,
        type:           n.type as any,
        latitude:       n.lat,
        longitude:      n.lng,
        capacity:       n.cap,
        population:     n.pop,
        disasterRisk:   0,
      },
    })
    console.log(`  ✓ ${n.label} (${n.type})`)
  }

  // ─── Edges (roads connecting nodes) ─────────────────
  console.log('\nCreating road network edges...')

  const edgeData = [
    // From depots
    ['node-depot-north', 'node-hosp-gen',    1.0],
    ['node-depot-north', 'node-hosp-metro',  1.8],
    ['node-depot-east',  'node-hosp-east',   1.0],
    ['node-depot-east',  'node-hosp-metro',  1.6],

    // Hospitals to zones
    ['node-hosp-gen',    'node-zone-alpha',  1.2],
    ['node-hosp-metro',  'node-zone-alpha',  1.0],
    ['node-hosp-metro',  'node-zone-beta',   1.0],
    ['node-hosp-east',   'node-zone-beta',   1.2],
    ['node-hosp-gen',    'node-zone-gamma',  1.6],
    ['node-hosp-east',   'node-zone-delta',  1.5],
    ['node-hosp-metro',  'node-city-centre', 1.8],

    // Zone to zone
    ['node-zone-alpha',  'node-zone-beta',   1.4],
    ['node-zone-alpha',  'node-zone-gamma',  1.1],
    ['node-zone-beta',   'node-zone-delta',  1.1],
    ['node-zone-gamma',  'node-city-centre', 1.0],
    ['node-zone-delta',  'node-city-centre', 1.0],

    // Shelters
    ['node-zone-gamma',  'node-shelter-w',   0.9],
    ['node-shelter-w',   'node-city-centre', 1.3],
    ['node-zone-delta',  'node-shelter-e',   0.9],
    ['node-city-centre', 'node-shelter-e',   1.3],
  ]

  for (const [from, to, weight] of edgeData) {
    // Create edge in both directions (bidirectional roads)
    for (const [f, t] of [[from, to], [to, from]]) {
      await prisma.graphEdge.upsert({
        where: { fromNodeId_toNodeId: { fromNodeId: f as string, toNodeId: t as string } },
        update: { weight: weight as number },
        create: {
          organizationId: org.id,
          fromNodeId:     f as string,
          toNodeId:       t as string,
          weight:         weight as number,
          status:         'OPEN',
        },
      })
    }
  }
  console.log(`  ✓ ${edgeData.length * 2} edges created (${edgeData.length} roads, bidirectional)`)

  // ─── Resources ──────────────────────────────────────
  console.log('\nCreating resource fleet...')

  const resourceData = [
    { id: 'res-amb-01', label: 'AMB-01',   type: 'AMBULANCE',   nodeId: 'node-depot-north', cap: 4 },
    { id: 'res-amb-02', label: 'AMB-02',   type: 'AMBULANCE',   nodeId: 'node-depot-north', cap: 4 },
    { id: 'res-amb-03', label: 'AMB-03',   type: 'AMBULANCE',   nodeId: 'node-depot-east',  cap: 4 },
    { id: 'res-amb-04', label: 'AMB-04',   type: 'AMBULANCE',   nodeId: 'node-depot-east',  cap: 4 },
    { id: 'res-fire-01',label: 'FIRE-01',  type: 'FIRE_TRUCK',  nodeId: 'node-city-centre', cap: 6 },
    { id: 'res-fire-02',label: 'FIRE-02',  type: 'FIRE_TRUCK',  nodeId: 'node-city-centre', cap: 6 },
    { id: 'res-team-01',label: 'TEAM-01',  type: 'RESCUE_TEAM', nodeId: 'node-shelter-w',   cap: 10 },
    { id: 'res-team-02',label: 'TEAM-02',  type: 'RESCUE_TEAM', nodeId: 'node-shelter-e',   cap: 10 },
  ]

  for (const r of resourceData) {
    await prisma.resource.upsert({
      where:  { id: r.id },
      update: {},
      create: {
        id:             r.id,
        organizationId: org.id,
        label:          r.label,
        type:           r.type as any,
        status:         'IDLE',
        currentNodeId:  r.nodeId,
        capacity:       r.cap,
        fuelLevel:      1.0,
        fatigueLevel:   0,
        skillLevel:     3,
      },
    })
    console.log(`  ✓ ${r.label} (${r.type}) at ${r.nodeId}`)
  }

  // ─── Summary ────────────────────────────────────────
  const counts = {
    nodes:     await prisma.graphNode.count({ where: { organizationId: org.id } }),
    edges:     await prisma.graphEdge.count({ where: { organizationId: org.id } }),
    resources: await prisma.resource.count({ where: { organizationId: org.id } }),
    users:     await prisma.user.count({ where: { organizationId: org.id } }),
  }

  console.log('\n══════════════════════════════════════════')
  console.log('  ✅ Seed Complete')
  console.log(`  Organization: ${org.name}`)
  console.log(`  Nodes:     ${counts.nodes}`)
  console.log(`  Edges:     ${counts.edges}`)
  console.log(`  Resources: ${counts.resources}`)
  console.log(`  Users:     ${counts.users}`)
  console.log('══════════════════════════════════════════\n')
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

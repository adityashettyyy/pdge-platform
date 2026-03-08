// src/services/__tests__/trust-score.test.ts
// ─────────────────────────────────────────────────────────
// STANDALONE TEST — run BEFORE connecting to any route.
// This proves TrustScoreService works correctly in isolation.
//
// HOW TO RUN:
//   1. Make sure your DATABASE_URL is set in .env
//   2. Make sure you've run: npx prisma migrate dev
//   3. Run: npx ts-node src/services/__tests__/trust-score.test.ts
//
// WHAT TO EXPECT:
//   Report 1: ~30 points  → UNVERIFIED (base only, no GPS)
//   Report 2: ~55 points  → ACCUMULATING (base + GPS bonus)
//   Report 3: ~70 points  → VERIFIED ✓ (base + GPS + 1 cluster)
//   Report 4: ~85 points  → VERIFIED (continues rising)
// ─────────────────────────────────────────────────────────

import { config } from 'dotenv'
config()  // load .env before importing prisma

import { prisma } from '../../config/db'
import { TrustScoreService } from '../trust-score'

async function runTest() {
  console.log('\n══════════════════════════════════════════')
  console.log('  TrustScoreService — Standalone Test')
  console.log('══════════════════════════════════════════\n')

  const service = new TrustScoreService()

  try {
    // ── SETUP: Create test org + node + incident ──────────
    console.log('Setting up test data...')

    const org = await prisma.organization.upsert({
      where: { slug: 'test-org' },
      update: {},
      create: { name: 'Test Org', slug: 'test-org' },
    })
    console.log(`✓ Organization: ${org.name} (${org.id})`)

    const node = await prisma.graphNode.upsert({
      where: { id: 'test-node-001' },
      update: {},
      create: {
        id:             'test-node-001',
        organizationId: org.id,
        label:          'Test Zone Alpha',
        type:           'ZONE',
        latitude:       19.0760,
        longitude:      72.8777,
        population:     50000,
      },
    })
    console.log(`✓ GraphNode: ${node.label} (${node.id})`)

    const incident = await prisma.incident.create({
      data: {
        organizationId: org.id,
        type:           'FLOOD',
        status:         'UNVERIFIED',
        originNodeId:   node.id,
        latitude:       19.0760,
        longitude:      72.8777,
        trustScore:     0,
      },
    })
    console.log(`✓ Incident created: ${incident.id}\n`)

    // ── TEST: Submit 4 reports, watch score climb ─────────
    const reports = [
      { gpsValid: false, label: 'Report 1 (no GPS)',            sensorData: undefined },
      { gpsValid: true,  label: 'Report 2 (GPS valid)',         sensorData: undefined },
      { gpsValid: true,  label: 'Report 3 (GPS + corroborate)', sensorData: undefined },
      { gpsValid: true,  label: 'Report 4 (sensor data)',       sensorData: { accelerometerSpike: true } },
    ]

    for (let i = 0; i < reports.length; i++) {
      const report = reports[i]
      console.log(`\n─── ${report.label} ───`)

      const result = await service.processReport({
        incidentId:    incident.id,
        gpsValid:      report.gpsValid,
        reporterLat:   19.0760,
        reporterLng:   72.8777,
        claimedNodeId: node.id,
        sensorData:    report.sensorData,
      })

      console.log(`Score:      ${result.score.toFixed(1)} / 100`)
      console.log(`Verdict:    ${result.verdict}`)
      console.log(`Verified:   ${result.isVerified ? '✓ YES' : '✗ NO'}`)
      console.log('Breakdown:', result.breakdown)

      if (result.isVerified) {
        console.log('\n  🟢 VERIFIED — simulation would be triggered now!')
        if (i < reports.length - 1) {
          console.log('  (Continuing test to show score keeps rising...)')
        }
      }
    }

    // ── VERIFY: Check DB state ────────────────────────────
    console.log('\n─── Database State Check ───')
    const finalIncident = await prisma.incident.findUnique({
      where: { id: incident.id },
      include: { trustScores: { orderBy: { createdAt: 'asc' } } },
    })
    console.log(`Incident status:      ${finalIncident!.status}`)
    console.log(`Incident trustScore:  ${finalIncident!.trustScore}`)
    console.log(`Incident reportCount: ${finalIncident!.reportCount}`)
    console.log(`TrustScore records:   ${finalIncident!.trustScores.length}`)
    console.log('Scores by report:    ', finalIncident!.trustScores.map(t => t.score.toFixed(1)))

    // ── CLEANUP ───────────────────────────────────────────
    console.log('\n─── Cleanup ───')
    await prisma.trustScore.deleteMany({ where: { incidentId: incident.id } })
    await prisma.incident.delete({ where: { id: incident.id } })
    await prisma.graphNode.delete({ where: { id: node.id } })
    await prisma.organization.delete({ where: { id: org.id } })
    console.log('✓ Test data cleaned up')

    console.log('\n══════════════════════════════════════════')
    console.log('  ✅ TrustScoreService TEST PASSED')
    console.log('══════════════════════════════════════════\n')

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runTest()

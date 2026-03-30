// src/server.ts

import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'

import app from './app'
import { prisma, disconnectDb } from './config/db'
import { bullMQConnection, redisCache } from './config/redis'
import { digitalTwinService } from './services/digital-twin.service'
import { queueService } from './services/queue'

const PORT = Number(process.env.PORT ?? 3001)

const server = http.createServer(app)

// WebSocket server
const wss = new WebSocketServer({
  server,
  path: '/ws',
})

const clients = new Map<string, Set<WebSocket>>()

wss.on('connection', (ws: WebSocket, req) => {

  const url = new URL(req.url ?? '', `http://localhost:${PORT}`)
  const orgId = url.searchParams.get('orgId')

  if (!orgId) {
    ws.close(1008, 'orgId required')
    return
  }

  if (!clients.has(orgId)) {
    clients.set(orgId, new Set())
  }

  clients.get(orgId)!.add(ws)

  console.log(`[WS] Client connected for org ${orgId}`)

  const unsubscribe = digitalTwinService.subscribe(orgId, (event: any) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event))
    }
  })

  ws.on('close', () => {
    clients.get(orgId)?.delete(ws)
    unsubscribe()
    console.log(`[WS] Client disconnected for org ${orgId}`)
  })

  ws.on('error', (err: Error) => {
    console.error('[WS] Client error:', err.message)
  })

  digitalTwinService.loadGraph(orgId).then((snapshot: any) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'INITIAL_STATE',
        payload: snapshot
      }))
    }
  })

})

// Startup
async function start() {

  try {

    await prisma.$queryRaw`SELECT 1`
    console.log('[DB] PostgreSQL connected')

    await redisCache.ping()
    console.log('[Redis] Connected')

    server.listen(PORT, () => {

      console.log(`\n🚀 PDGE Backend running on http://localhost:${PORT}`)
      console.log(`🔌 WebSocket server on ws://localhost:${PORT}/ws`)
      console.log(`📊 Health check: http://localhost:${PORT}/health\n`)

    })

  } catch (err) {

    console.error('[Startup] Failed:', err)
    process.exit(1)

  }

}

// Graceful shutdown
async function shutdown(signal: string) {

  console.log(`\n[Shutdown] ${signal} received — shutting down gracefully...`)

  server.close(async () => {

    await queueService.shutdown()
    await disconnectDb()
    await bullMQConnection.quit()
    await redisCache.quit()

    console.log('[Shutdown] Complete')

    process.exit(0)

  })

}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

start()
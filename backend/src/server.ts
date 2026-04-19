import "dotenv/config";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app";
import { prisma, disconnectDb } from "./config/db";
import { bullMQConnection, redisCache } from "./config/redis";
import { digitalTwinService } from "./services/digital-twin.service";
import { queueService } from "./services/queue.service";

const PORT = Number(process.env.PORT ?? 3001);
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws: WebSocket, req) => {
  const url = new URL(req.url ?? "", `http://localhost:${PORT}`);
  const orgId = url.searchParams.get("orgId");
  if (!orgId) { ws.close(1008, "orgId required"); return; }
  console.log(`[WS] Client connected for org ${orgId}`);
  const unsub = digitalTwinService.subscribe(orgId, (event: any) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  });
  ws.on("close", () => { unsub(); console.log(`[WS] Client disconnected`); });
  ws.on("error", (e: Error) => console.error("[WS] Error:", e.message));
  digitalTwinService.loadGraph(orgId).then(snapshot => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "INITIAL_STATE", payload: snapshot }));
  });
});

async function start() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("[DB] PostgreSQL connected");
    await redisCache.ping();
    console.log("[Redis] Connected");
    server.listen(PORT, () => {
      console.log(`\n🚀 PDGE Backend on http://localhost:${PORT}`);
      console.log(`🔌 WebSocket on ws://localhost:${PORT}/ws\n`);
    });
  } catch (e) { console.error("[Startup] Failed:", e); process.exit(1); }
}

async function shutdown(sig: string) {
  console.log(`\n[Shutdown] ${sig}`);
  server.close(async () => {
    await queueService.shutdown();
    await disconnectDb();
    await bullMQConnection.quit();
    await redisCache.quit();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
start();

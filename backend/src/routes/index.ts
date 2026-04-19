import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { login, me } from "../controllers/auth.controller";
import { reportIncident, addReport, getIncidents, getIncident, closeIncident } from "../controllers/incident.controller";
import { getNodes, getEdges, getSnapshot, blockEdge } from "../controllers/graph.controller";
import { getResources } from "../controllers/resource.controller";
import { getPlans, approvePlan } from "../controllers/allocation.controller";
import { getKPIs } from "../controllers/dashboard.controller";
import { getMonthlyStats, getZoneResponseTimes, getDisasterTypeStats } from "../controllers/analytics.controller";
import { generateSitrep } from "../controllers/commander.controller";

const r = Router();

r.post("/auth/login", login);
r.get("/auth/me", authenticate, me);
r.get("/dashboard/kpis", authenticate, getKPIs);
r.get("/graph/nodes", authenticate, getNodes);
r.get("/graph/edges", authenticate, getEdges);
r.get("/graph/snapshot", authenticate, getSnapshot);
r.patch("/graph/edges/:id/block", authenticate, blockEdge);
r.get("/resources", authenticate, getResources);
r.post("/incidents/report", authenticate, reportIncident);
r.get("/incidents", authenticate, getIncidents);
r.get("/incidents/:id", authenticate, getIncident);
r.post("/incidents/:id/report", authenticate, addReport);
r.post("/incidents/:id/close", authenticate, closeIncident);
r.get("/allocation-plans", authenticate, getPlans);
r.post("/allocation-plans/:id/approve", authenticate, approvePlan);
r.get("/analytics/monthly", authenticate, getMonthlyStats);
r.get("/analytics/response-times", authenticate, getZoneResponseTimes);
r.get("/analytics/disaster-types", authenticate, getDisasterTypeStats);
r.post("/commander/sitrep/:id", authenticate, generateSitrep);

export default r;

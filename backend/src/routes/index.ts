// routes/index.ts — all routes with validation and per-endpoint rate limiting

import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { loginLimiter, reportLimiter, sitrepLimiter, approvalLimiter } from "../middleware/rate-limit";
import { validate, LoginSchema, ReportIncidentSchema, AddReportSchema, BlockEdgeSchema } from "../middleware/validate";
import { login, me } from "../controllers/auth.controller";
import { reportIncident, addReport, getIncidents, getIncident, closeIncident } from "../controllers/incident.controller";
import { getNodes, getEdges, getSnapshot, blockEdge } from "../controllers/graph.controller";
import { getResources } from "../controllers/resource.controller";
import { getPlans, approvePlan } from "../controllers/allocation.controller";
import { getKPIs } from "../controllers/dashboard.controller";
import { getMonthlyStats, getZoneResponseTimes, getDisasterTypeStats, getPerformanceKPIs } from "../controllers/analytics.controller";
import { generateSitrep } from "../controllers/commander.controller";

const r = Router();

// Auth
r.post("/auth/login", loginLimiter, validate(LoginSchema), login);
r.get("/auth/me", authenticate, me);

// Dashboard
r.get("/dashboard/kpis", authenticate, getKPIs);

// Graph
r.get("/graph/nodes",         authenticate, getNodes);
r.get("/graph/edges",         authenticate, getEdges);
r.get("/graph/snapshot",      authenticate, getSnapshot);
r.patch("/graph/edges/:id/block", authenticate, validate(BlockEdgeSchema), blockEdge);

// Resources
r.get("/resources", authenticate, getResources);

// Incidents — report endpoint has strict rate limiting + validation
r.post("/incidents/report",       authenticate, reportLimiter, validate(ReportIncidentSchema), reportIncident);
r.get("/incidents",               authenticate, getIncidents);
r.get("/incidents/:id",           authenticate, getIncident);
r.post("/incidents/:id/report",   authenticate, reportLimiter, validate(AddReportSchema), addReport);
r.post("/incidents/:id/close",    authenticate, closeIncident);

// Allocation plans
r.get("/allocation-plans",             authenticate, getPlans);
r.post("/allocation-plans/:id/approve", authenticate, approvalLimiter, approvePlan);

// Analytics — new performance endpoint exposes real computed numbers
r.get("/analytics/monthly",           authenticate, getMonthlyStats);
r.get("/analytics/response-times",    authenticate, getZoneResponseTimes);
r.get("/analytics/disaster-types",    authenticate, getDisasterTypeStats);
r.get("/analytics/performance",       authenticate, getPerformanceKPIs);

// AI Commander
r.post("/commander/sitrep/:id", authenticate, sitrepLimiter, generateSitrep);

export default r;
# PDGE v2 — Predictive Disaster Graph Engine

## Predictive · Graph-based · Self-improving

A production-grade disaster response platform that pre-positions resources
before impact using Bayesian trust scoring, BFS spread simulation, and
demand-driven OR-Tools allocation — all on a live city graph.

---

## Architecture

```bash
Citizen report → Trust score (Bayesian) → 70+ threshold →
BFS spread simulation (9 ticks, T+2h/T+4h/T+6h) →
Severity classifier (population × disaster type × infra) →
Demand matrix (LOW/MEDIUM/HIGH/CRITICAL) →
Dijkstra routing (avoids BLOCKED edges) →
Allocation plan → Human approval → Dispatch →
PostMortem (EMA learning) → Next simulation is more accurate
```

## Stack

| Layer | Technology |
|-------|------------|

| Backend API | Node.js 20 + Express 4 + BullMQ 5 + WebSocket |
| Database | PostgreSQL 16 + Prisma 6 |
| Queue | Redis 7 |
| Optimizer | Python 3.10 + FastAPI + NetworkX + OR-Tools |
| Frontend | React 18 + Framer Motion + Recharts + Tailwind 3 |
| AI | Claude claude-sonnet-4-6 (sitrep generation) |

---

## Prerequisites

```bash
node --version     # 18+
python --version   # 3.10+
docker --version   # 20+
```

---

## Quick Start

### Step 1 — Start infrastructure

```bash
# From project root
docker compose up -d postgres redis

# Verify both are healthy before continuing
docker compose ps
```

### Step 2 — Environment

```bash
cd backend
cp ../.env.example .env
```

Open `.env` and fill in:

```env
DATABASE_URL="postgresql://pdge:pdge_secret@localhost:5432/pdge_db"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">"
ANTHROPIC_API_KEY="sk-ant-your-key-here"
PYTHON_SERVICE_URL="http://localhost:8000"
PORT=3001
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"
VITE_API_URL="http://localhost:3001/api"
VITE_WS_URL="ws://localhost:3001/ws"
```

### Step 3 — Backend setup

```bash
cd backend
npm install
npm run db:migrate
npm run db:generate
npm run db:seed
```

Expected seed output:

```bash
✓ Org: Mumbai NDRF District
✓ Users: admin@pdge.local / admin123
✓ 12 nodes
✓ 40 edges
✓ 10 resources
✅ Seed complete
```

### Step 4 — Python service

```bash
cd optimization-service

# Create and activate virtual environment
python -m venv venv

# Mac/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

pip install -r requirements.txt

# Verify
python -c "import networkx; print('NetworkX OK')"

# Start
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Expected output:

```bash
=== PDGE Python Optimization Service v2.0 ===
INFO: Uvicorn running on http://0.0.0.0:8000
```

### Step 5 — Run all services (5 terminals)

```bash
# Terminal 1 — Backend API
cd backend && npm run dev

# Terminal 2 — Trust score worker
cd backend && npm run worker:trust

# Terminal 3 — Simulation worker
cd backend && npm run worker:simulation

# Terminal 4 — Python optimizer (already running from step 4)

# Terminal 5 — Frontend
cd frontend && npm install && npm run dev
```

Open <http://localhost:5173>

Login: `admin@pdge.local` / `admin123`

---

## Startup order matters

```bash
1. Docker (Postgres + Redis)     ← must be healthy first
2. Python uvicorn                ← must be up before simulation worker calls it
3. Backend npm run dev           ← connects to DB + Redis on boot
4. npm run worker:trust          ← connects to Redis
5. npm run worker:simulation     ← connects to Redis + calls Python
6. Frontend npm run dev          ← calls backend API
```

Never start the backend before Docker is healthy.
Never start the simulation worker before Python is running.

---

## Verify everything is working

```bash
# Python health
curl http://localhost:8000/health
# → {"status":"ok","service":"pdge-optimization","version":"2.0.0"}

# Backend health
curl http://localhost:3001/health
# → {"status":"ok","timestamp":"..."}

# Login (Windows PowerShell)
Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
  -Method POST -ContentType "application/json" `
  -Body '{"email":"admin@pdge.local","password":"admin123"}'
# → {token: "eyJ...", user: {...}}
```

---

## Load demo scenario (optional but recommended for presentations)

```bash
cd backend
npm run db:demo
```

This creates a flood incident at Zone Beta already at trust score 68
(one report away from triggering the full simulation loop).
Lets you demonstrate the live trigger during a presentation.

---

## Trigger the full intelligence loop manually

```powershell
# From project root (Windows)
.\demo.ps1

# Or manually via PowerShell:
$auth = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
  -Method POST -ContentType "application/json" `
  -Body '{"email":"admin@pdge.local","password":"admin123"}'
$TOKEN = $auth.token

# Submit report (returns incidentId)
$r = Invoke-RestMethod -Uri "http://localhost:3001/api/incidents/report" `
  -Method POST -ContentType "application/json" `
  -Headers @{Authorization="Bearer $TOKEN"} `
  -Body '{"type":"FLOOD","latitude":19.072,"longitude":72.880,"originNodeId":"node-zone-beta","gpsValid":true}'

# Add 2 more reports to push score past 70
Invoke-RestMethod -Uri "http://localhost:3001/api/incidents/$($r.incidentId)/report" `
  -Method POST -ContentType "application/json" `
  -Headers @{Authorization="Bearer $TOKEN"} `
  -Body '{"gpsValid":true,"latitude":19.073,"longitude":72.881}'

Invoke-RestMethod -Uri "http://localhost:3001/api/incidents/$($r.incidentId)/report" `
  -Method POST -ContentType "application/json" `
  -Headers @{Authorization="Bearer $TOKEN"} `
  -Body '{"gpsValid":true,"latitude":19.071,"longitude":72.879}'
```

Watch the terminals — trust worker verifies, simulation runs, allocation plan
appears in AI Commander for approval.

---

## Key concepts

**Trust scoring (Bayesian)**
Each report adds to a score: base(30) + GPS(+25) + cluster(+15/report) + sensor(+10).
Score ≥ 70 = VERIFIED → triggers simulation automatically.

**BFS spread simulation**
9 ticks × 40 min = T+6h forecast. Origin node starts at risk 1.0.
Each tick propagates: `risk = parent × spreadCoefficient × edgeFactor × nodeTypeMod`.
BLOCKED edges are excluded. HOSPITAL nodes absorb 30% of incoming risk.

**Severity classification**
`typeWeight×30 + nodeCount×5 + log(population)×2.5 + infraBonus` → 0–100 score.
Maps to LOW / MEDIUM / HIGH / CRITICAL → demand matrix lookup.

**Demand matrix (CRITICAL flood example)**
`{ AMBULANCE: 10, RESCUE_TEAM: 6, SUPPLY_TRUCK: 6, FIRE_TRUCK: 3, HELICOPTER: 2 }`
Solver assigns idle resources to fill demand via Dijkstra routing.

**PostMortem learning**
After each closed incident: compare forecast vs actual, update `spreadCoefficient`
via EMA (`new = 0.8×old + 0.2×correction`). Next simulation for same disaster
type is more accurate.

---

## Project structure

```bash
pdge-v2/
├── docker-compose.yml           ← Postgres + Redis
├── .env.example                 ← Copy to backend/.env
├── demo.ps1                     ← PowerShell demo trigger script
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        ← 11 models, Prisma 6
│   │   ├── seed.ts              ← 12 Mumbai nodes, 10 resources, 2 users
│   │   └── demo-seed.ts        ← Pre-built flood scenario for demos
│   └── src/
│       ├── config/              ← db.ts, redis.ts
│       ├── controllers/         ← auth, incident, graph, resource, allocation,
│       │                           dashboard, analytics, commander
│       ├── middleware/          ← auth (JWT + RBAC), error handler
│       ├── routes/              ← all API routes registered here
│       ├── services/            ← trust-score, queue, digital-twin, postmortem
│       ├── workers/             ← trust-score.worker, simulation.worker
│       ├── app.ts               ← Express setup
│       └── server.ts            ← HTTP + WebSocket server
│
├── optimization-service/
│   ├── main.py                  ← FastAPI entry point (/health /simulate /allocate)
│   ├── models.py                ← Pydantic contracts
│   ├── graph/
│   │   ├── city_graph.py        ← NetworkX + Dijkstra (BLOCKED edge exclusion)
│   │   └── disaster_spread.py   ← BFS tick simulation
│   └── solver/
│       └── allocation_solver.py ← SeverityClassifier + demand matrix + routing
│
└── frontend/
    └── src/app/
        ├── components/
        │   ├── Landing.tsx       ← Landing page
        │   ├── Login.tsx         ← Auth form
        │   ├── Shell.tsx         ← Sidebar + header layout
        │   ├── Dashboard.tsx     ← Live KPIs + active incidents
        │   ├── LiveMap.tsx       ← SVG city graph with real-time risk
        │   ├── ReportIncident.tsx← Multi-step report form
        │   ├── Resources.tsx     ← Fleet status + allocation history
        │   ├── Analytics.tsx     ← Charts + PDGE vs traditional delta
        │   ├── Commander.tsx     ← Claude sitrep + plan approval
        │   └── SettingsPage.tsx  ← User profile + system config
        ├── context/AuthContext.tsx
        ├── hooks/useApi.ts, useWebSocket.ts
        └── lib/api.ts, endpoints.ts, types.ts
```

---

## Common problems

```bash
| Error | Fix |
|-------|-----|
| `Cannot connect to database` | `docker compose ps` — postgres must be healthy |
| `Redis connection refused` | `docker compose up -d redis` |
| `Python service unreachable` | Start `uvicorn` before `npm run worker:simulation` |
| `Table does not exist` | `npm run db:migrate` then `npm run db:generate` |
| `seed fails on edges` | Already handled — upsert by compound key `(fromNodeId, toNodeId)` |
| WebSocket shows OFFLINE | Normal on landing page. After login → dashboard it becomes LIVE |
| `Cannot GET /` at localhost:3001 | Expected — no route at `/`, use `/health` or `/api/*` |
```

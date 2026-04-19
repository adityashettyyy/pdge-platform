from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import time
from models import SimulationRequest, SimulationResponse, AllocationRequest, AllocationResponse, HealthResponse
from graph.city_graph import CityGraph
from graph.disaster_spread import DisasterSpreadSimulator
from solver.allocation_solver import AllocationSolver

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("\n=== PDGE Python Optimization Service v2.0 ===\n")
    yield

app = FastAPI(title="PDGE Optimization", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3001"], allow_methods=["GET","POST"], allow_headers=["*"])

_graph = CityGraph()
_simulator = DisasterSpreadSimulator(_graph)
_solver = AllocationSolver(CityGraph())

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok", service="pdge-optimization", version="2.0.0")

@app.post("/simulate", response_model=SimulationResponse)
async def simulate(request: SimulationRequest):
    t = time.time()
    try:
        result = _simulator.simulate(request)
        print(f"[/simulate] {round((time.time()-t)*1000,1)}ms | {len(result.highRiskNodes)} high-risk nodes")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/allocate", response_model=AllocationResponse)
async def allocate(request: AllocationRequest):
    t = time.time()
    try:
        result = _solver.solve(request)
        print(f"[/allocate] {round((time.time()-t)*1000,1)}ms | tier:{result.severityTier} | {result.totalResources} assignments")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

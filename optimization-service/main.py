# main.py
# FastAPI entry point — the Python microservice HTTP server.
#
# Node.js calls this via HTTP. This service knows nothing
# about Express, Prisma, or BullMQ. It just:
#   1. Receives a request with graph + incident data
#   2. Runs BFS simulation OR allocation optimization
#   3. Returns JSON result
#
# Start: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# Docs:  http://localhost:8000/docs  (auto-generated Swagger UI)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import time

from models import (
    SimulationRequest, SimulationResponse,
    AllocationRequest, AllocationResponse,
    HealthResponse,
)
from graph.city_graph import CityGraph
from graph.disaster_spread import DisasterSpreadSimulator
from solver.allocation_solver import AllocationSolver


# ── App lifecycle ─────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("\n" + "="*50)
    print("  PDGE Python Optimization Microservice")
    print("  Starting up...")
    print("="*50 + "\n")
    yield
    print("\n[Shutdown] Optimization service shutting down")


app = FastAPI(
    title="PDGE Optimization Microservice",
    description="BFS Disaster Spread Simulation + OR-Tools Resource Allocation",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow calls from Node.js backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Shared graph instance — rebuilt on each request
# (stateless by design — Node.js always sends full graph state)
_graph = CityGraph()
_simulator = DisasterSpreadSimulator(_graph)
_solver    = AllocationSolver(_graph)


# ── Routes ────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check — Docker and Node.js poll this."""
    return HealthResponse(
        status="ok",
        service="pdge-optimization",
        version="1.0.0",
    )


@app.post("/simulate", response_model=SimulationResponse)
async def simulate(request: SimulationRequest):
    """
    Run BFS epidemic spread simulation.

    Node.js calls this when an incident is VERIFIED (trust score >= 70).
    Returns 3 risk forecasts: T+2h, T+4h, T+6h.

    Input:  incident ID + origin node + full graph state
    Output: risk map per node at each forecast horizon
    """
    start_time = time.time()

    try:
        result = _simulator.simulate(request)
        elapsed = round((time.time() - start_time) * 1000, 1)
        print(f"[API] /simulate completed in {elapsed}ms")
        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[API] /simulate ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")


@app.post("/allocate", response_model=AllocationResponse)
async def allocate(request: AllocationRequest):
    """
    Run OR-Tools CP-SAT resource allocation optimization.

    Node.js calls this after simulation completes.
    Returns optimal pre-positioning plan for all resources.

    Input:  simulation result (risk maps) + full resource list + graph
    Output: assignment plan (which resource goes where, via which route)
    """
    start_time = time.time()

    try:
        result = _solver.solve(request)
        elapsed = round((time.time() - start_time) * 1000, 1)
        print(f"[API] /allocate completed in {elapsed}ms")
        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[API] /allocate ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Allocation failed: {str(e)}")


@app.post("/simulate-and-allocate")
async def simulate_and_allocate(request: SimulationRequest):
    """
    Combined endpoint — runs simulation then allocation in one call.
    Useful for the demo where you want everything in one shot.
    Node.js can also call /simulate and /allocate separately.
    """
    start_time = time.time()

    try:
        # Step 1: Simulate spread
        sim_result = _simulator.simulate(request)

        # Step 2: Allocate resources based on simulation
        # (Node.js would normally pass resources — we return sim only here
        #  and let Node.js call /allocate separately with resource data)

        elapsed = round((time.time() - start_time) * 1000, 1)
        print(f"[API] /simulate-and-allocate completed in {elapsed}ms")

        return {
            "simulation": sim_result,
            "message": "Simulation complete. Call /allocate with resource data to get allocation plan."
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

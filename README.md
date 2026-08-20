# Port Disruption Agent

Starter workspace for a port disruption management agent with a Next.js dashboard, FastAPI backend, LangGraph agents, OR-Tools optimization, terminal simulation, and demo scenarios.

## Project Layout

- `frontend/app/` - Next.js pages and dashboard components
- `backend/app/agents/` - LangGraph state and agent workflows
- `backend/app/tools/` - tools available to agents
- `backend/app/optimizer/` - berth scheduling models
- `backend/app/simulation/` - fake terminal environment
- `backend/app/models/` - vessel, berth, crane, yard, and schedule schemas
- `backend/app/api/` - FastAPI route modules
- `scenarios/` - JSON scenarios for demos
- `docs/` - architecture, product, and demo notes

## Backend Quick Start

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The health endpoint is available at `http://localhost:8000/health`.

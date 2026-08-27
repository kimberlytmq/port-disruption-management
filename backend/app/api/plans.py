"""Plan API routes."""
from fastapi import APIRouter

from app import run_state

router = APIRouter()


@router.get("/plans")
async def get_plans():
    """Returns candidate plans and KPIs for the active run."""
    if not run_state.active_run_state:
        return {"candidate_plans": [], "recommended_plan": None}

    return {
        "candidate_plans": run_state.active_run_state.get("candidate_plans", []),
        "plan_kpis": run_state.active_run_state.get("plan_kpis", {}),
        "recommended_plan": run_state.active_run_state.get("recommended_plan")
    }

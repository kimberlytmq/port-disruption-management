"""Disruption API routes."""
import uuid
from typing import List, Optional, cast

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from langgraph.types import Command

from app.agents.graph import app as agent_graph
from app.agents.state import AgentState
from app import run_state

router = APIRouter()


# --- Pydantic Models (Spec-Compliant Contracts) ---

class DisruptionEventDetail(BaseModel):
    type: str
    vessel_id: Optional[str] = None
    crane_id: Optional[str] = None
    time: Optional[str] = None
    old_eta: Optional[str] = None
    new_eta: Optional[str] = None
    expected_repair_time: Optional[str] = None
    delay_hours: Optional[float] = None

    @field_validator('type')
    def validate_event_type(cls, v):
        allowed = ['VESSEL_DELAY', 'CRANE_FAILURE', 'YARD_CONGESTION']
        if v not in allowed:
            raise ValueError(f"Unsupported event type. Must be one of {allowed}")
        return v


class DisruptionPayload(BaseModel):
    scenario: Optional[str] = "Custom Disruption"
    events: List[DisruptionEventDetail] = Field(..., min_length=1)


class ApprovalRequest(BaseModel):
    plan_id: str
    approved: bool


@router.post("/disruptions")
async def trigger_disruption(payload: DisruptionPayload):
    """
    Triggers the LangGraph agent pipeline.
    Returns the structured envelope required by the frontend dashboard.
    """
    initial_state = cast(AgentState, {
        "status": "in_progress",
        "disruption_summary": f"Processing {len(payload.events)} disruption event(s)...",
        "disruption_event": payload.model_dump(),
        "agent_steps": [],
        "impact_graph": None,
        "candidate_plans": None,
        "plan_kpis": None,
        "recommended_plan": None,
        "final_explanation": None,
        "human_approval": None
    })

    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    try:
        raw_result = agent_graph.invoke(initial_state, config=config)
        run_state.active_run_state = cast(AgentState, raw_result)
        run_state.active_thread_id = thread_id

        is_paused = "__interrupt__" in raw_result
        status = (
            "awaiting_approval"
            if is_paused
            else run_state.active_run_state.get("status", "completed")
        )

        return {
            "run_id": thread_id,
            "status": status,
            "disruption_summary": run_state.active_run_state.get("disruption_summary"),
            "recommended_plan": run_state.active_run_state.get("recommended_plan"),
            "agent_steps": run_state.active_run_state.get("agent_steps", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline execution failed: {str(e)}")


@router.post("/approve")
async def approve_plan(request: ApprovalRequest):
    """
    Resumes the paused LangGraph run at its human_approval interrupt,
    which lets apply_plan actually run (or skip applying, if rejected).
    """
    if not run_state.active_thread_id:
        raise HTTPException(
            status_code=400,
            detail="No run is currently awaiting approval."
        )

    config = {"configurable": {"thread_id": run_state.active_thread_id}}

    try:
        raw_result = agent_graph.invoke(Command(resume=request.approved), config=config)
        run_state.active_run_state = cast(AgentState, raw_result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Resume failed: {str(e)}")

    action_str = "approved" if request.approved else "rejected"

    return {
        "status": run_state.active_run_state.get("status", action_str),
        "plan_id": request.plan_id,
        "message": f"Plan {request.plan_id} has been {action_str} by the duty planner.",
        "agent_steps": run_state.active_run_state.get("agent_steps", [])
    }

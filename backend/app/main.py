from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from typing import Dict, Any, List, Optional, cast
from app.agents.graph import app as agent_graph
from app.agents.state import AgentState

# --- 1. Server Initialization ---
app = FastAPI(title="Port Disruption Recovery API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. Pydantic Models (Spec-Compliant Contracts) ---

class DisruptionEventDetail(BaseModel):
    type: str
    vessel_id: Optional[str] = None
    crane_id: Optional[str] = None
    delay_hours: Optional[float] = None

    @field_validator('type')
    def validate_event_type(cls, v):
        allowed = ['VESSEL_DELAY', 'CRANE_FAILURE', 'YARD_CONGESTION']
        if v not in allowed:
            raise ValueError(f"Unsupported event type. Must be one of {allowed}")
        return v

class DisruptionPayload(BaseModel):
    scenario: Optional[str] = "Custom Disruption"
    # Validates array is not empty AND contents are perfectly structured
    events: List[DisruptionEventDetail] = Field(..., min_length=1) 

class ApprovalRequest(BaseModel):
    plan_id: str
    approved: bool

# Global memory store for hackathon MVP (replaces DB)
active_run_state: Optional[AgentState] = None

# --- 3. API Routes (Matching Section 8) ---
@app.post("/disruptions")
async def trigger_disruption(payload: DisruptionPayload):
    """
    Triggers the LangGraph agent pipeline.
    Returns the structured envelope required by the frontend dashboard.
    """
    global active_run_state
    
    # Cast the initial dictionary to satisfy Pylance
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
    
    try:
        # Execute LangGraph and cast the returned generic dict back to AgentState
        raw_result = agent_graph.invoke(initial_state)
        active_run_state = cast(AgentState, raw_result)
        
        return {
            "status": active_run_state.get("status", "completed"),
            "disruption_summary": active_run_state.get("disruption_summary"),
            "recommended_plan": active_run_state.get("recommended_plan"),
            "agent_steps": active_run_state.get("agent_steps", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline execution failed: {str(e)}")

@app.post("/approve")
async def approve_plan(request: ApprovalRequest):
    """
    Receives human authorization for a specific plan.
    """
    global active_run_state
    
    if active_run_state:
        active_run_state["human_approval"] = request.approved
        
    action_str = "approved" if request.approved else "rejected"
    
    return {
        "status": action_str,
        "plan_id": request.plan_id,
        "message": f"Plan {request.plan_id} has been {action_str} by the duty planner."
    }

@app.get("/terminal-state")
async def get_terminal_state():
    """Stub for getting current terminal data."""
    return {"status": "ok", "message": "Terminal state data placeholder"}

@app.get("/plans")
async def get_plans():
    """Returns candidate plans and KPIs for the active run."""
    global active_run_state
    if not active_run_state:
        return {"candidate_plans": [], "recommended_plan": None}
        
    return {
        "candidate_plans": active_run_state.get("candidate_plans", []),
        "plan_kpis": active_run_state.get("plan_kpis", {}),
        "recommended_plan": active_run_state.get("recommended_plan")
    }

@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "PSA Hackathon Backend is running."}
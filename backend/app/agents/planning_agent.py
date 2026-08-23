"""Agent for creating operational plans."""
from .state import AgentState
from app.tools.optimisation_tools import generate_recovery_plans

def generate_candidates(state: AgentState) -> AgentState:
    """
    Planning Agent Node: Calls the optimizer to generate alternative recovery plans.
    Matches the 'generate_candidates' step in specs.md Section 4.
    """
    event_payload = state.get("disruption_event", {})
    steps = state.get("agent_steps", [])
    
    # 1. Call the optimizer tool
    optimizer_output = generate_recovery_plans(event_payload)
    
    # 2. Log it for the Next.js frontend's activity feed
    num_plans = len(optimizer_output.get("plans", []))
    steps.append({
        "step": "generate_candidates",
        "summary": f"Generated {num_plans} candidate recovery plans via OR-Tools."
    })
    
    # 3. Update the shared state
    state["agent_steps"] = steps
    state["candidate_plans"] = optimizer_output.get("plans", [])
    state["plan_kpis"] = optimizer_output.get("plan_kpis", {})
    
    print(f"Planning Agent: Generated {num_plans} candidates.")
    return state
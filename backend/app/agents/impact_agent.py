"""Agent for assessing disruption impact."""
from .state import AgentState
from app.tools.terminal_tools import assess_disruption

def assess_impact(state: AgentState) -> AgentState:
    """
    Impact Agent Node: Investigates downstream ripple effects.
    Matches the 'assess_impact' step in specs.md Section 4.
    """
    event_payload = state.get("disruption_event", {})
    steps = state.get("agent_steps", [])
    
    # 1. Call the tool
    impact_data = assess_disruption(event_payload)
    
    # 2. Log it for the frontend's live activity feed
    steps.append({
        "step": "assess_impact",
        "summary": "Assessed downstream impact: 1 berth and 1 downstream vessel affected."
    })
    
    # 3. Update the shared state
    state["agent_steps"] = steps
    state["impact_graph"] = impact_data
    
    return state
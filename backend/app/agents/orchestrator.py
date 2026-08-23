"""Coordinate the port disruption management agents."""
from .state import AgentState

def detect_disruption(state: AgentState) -> AgentState:
    """
    Orchestrator Node: Reads the disruption payload and initializes the recovery process.
    """
    # Grab the disruption payload
    event_payload = state.get("disruption_event", {})
    events = event_payload.get("events", [])
    
    # Get the current tracking steps (or start a new list)
    steps = state.get("agent_steps", [])
    
    # Figure out what happened
    if not events:
        summary = "No disruption events detected in payload."
    else:
        first_event = events[0]
        event_type = first_event.get("type", "UNKNOWN_EVENT")
        target = first_event.get("vessel_id") or first_event.get("crane_id", "System")
        summary = f"Detected {event_type} on {target}. Initiating impact assessment."
    
    # Log it for the frontend dashboard
    steps.append({
        "step": "detect_disruption",
        "summary": summary
    })
    
    # Update the state
    state["agent_steps"] = steps
    
    print(f"Orchestrator: {summary}")
    return state
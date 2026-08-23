from langgraph.graph import StateGraph, START, END
from .state import AgentState

# Existing nodes
from .orchestrator import detect_disruption
from .impact_agent import assess_impact
from .planning_agent import generate_candidates
from .recovery_agent import recommend_plan

# --- New Placeholder Nodes ---
def simulate_candidates(state: AgentState) -> AgentState:
    state.setdefault("agent_steps", []).append({
        "step": "simulate_candidates", 
        "summary": "Simulated candidate plans against terminal constraints."
    })
    return state

def evaluate_candidates(state: AgentState) -> AgentState:
    state.setdefault("agent_steps", []).append({
        "step": "evaluate_candidates", 
        "summary": "Evaluated plans using deterministic scoring."
    })
    return state

def human_approval(state: AgentState) -> AgentState:
    # In a full LangGraph setup, this would be an interrupt/breakpoint. 
    # For now, it logs that we are awaiting approval.
    state.setdefault("agent_steps", []).append({
        "step": "human_approval", 
        "summary": "Awaiting human duty planner approval."
    })
    return state

def apply_plan(state: AgentState) -> AgentState:
    state.setdefault("agent_steps", []).append({
        "step": "apply_plan", 
        "summary": "Plan execution simulated."
    })
    state["status"] = "completed"
    return state

# --- Graph Wiring ---
workflow = StateGraph(AgentState)

# Add all 8 nodes required by Section 4
workflow.add_node("detect_disruption", detect_disruption)
workflow.add_node("assess_impact", assess_impact)
workflow.add_node("generate_candidates", generate_candidates)
workflow.add_node("simulate_candidates", simulate_candidates)
workflow.add_node("evaluate_candidates", evaluate_candidates)
workflow.add_node("recommend_plan", recommend_plan)
workflow.add_node("human_approval", human_approval)
workflow.add_node("apply_plan", apply_plan)

# Wire the exact sequence
workflow.add_edge(START, "detect_disruption")
workflow.add_edge("detect_disruption", "assess_impact")
workflow.add_edge("assess_impact", "generate_candidates")
workflow.add_edge("generate_candidates", "simulate_candidates")
workflow.add_edge("simulate_candidates", "evaluate_candidates")
workflow.add_edge("evaluate_candidates", "recommend_plan")
workflow.add_edge("recommend_plan", "human_approval")
workflow.add_edge("human_approval", "apply_plan")
workflow.add_edge("apply_plan", END)

app = workflow.compile()
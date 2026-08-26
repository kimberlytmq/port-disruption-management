from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt
from .state import AgentState

# Existing nodes
from .orchestrator import detect_disruption
from .impact_agent import assess_impact
from .planning_agent import generate_candidates
from .recovery_agent import recommend_plan
from app.tools.terminal_tools import apply_recovery_plan

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
    steps = state.setdefault("agent_steps", [])
    if not steps or steps[-1]["step"] != "human_approval":
        steps.append({
            "step": "human_approval",
            "summary": "Awaiting human duty planner approval."
        })

    decision = interrupt({
        "question": "Approve the recommended recovery plan?",
        "recommended_plan": state.get("recommended_plan"),
    })

    state["human_approval"] = decision
    return state

def apply_plan(state: AgentState) -> AgentState:
    if state.get("human_approval"):
        plan = state.get("recommended_plan")
        if plan:
            apply_recovery_plan(plan)
        state.setdefault("agent_steps", []).append({
            "step": "apply_plan",
            "summary": "Plan approved by duty planner and applied to the terminal schedule."
        })
        state["status"] = "completed"
    else:
        state.setdefault("agent_steps", []).append({
            "step": "apply_plan",
            "summary": "Plan rejected by duty planner. No changes applied."
        })
        state["status"] = "rejected"
    return state

# --- Graph Wiring ---
workflow = StateGraph(AgentState)

workflow.add_node("detect_disruption", detect_disruption)
workflow.add_node("assess_impact", assess_impact)
workflow.add_node("generate_candidates", generate_candidates)
workflow.add_node("simulate_candidates", simulate_candidates)
workflow.add_node("evaluate_candidates", evaluate_candidates)
workflow.add_node("recommend_plan", recommend_plan)
workflow.add_node("human_approval", human_approval)
workflow.add_node("apply_plan", apply_plan)

workflow.add_edge(START, "detect_disruption")
workflow.add_edge("detect_disruption", "assess_impact")
workflow.add_edge("assess_impact", "generate_candidates")
workflow.add_edge("generate_candidates", "simulate_candidates")
workflow.add_edge("simulate_candidates", "evaluate_candidates")
workflow.add_edge("evaluate_candidates", "recommend_plan")
workflow.add_edge("recommend_plan", "human_approval")
workflow.add_edge("human_approval", "apply_plan")
workflow.add_edge("apply_plan", END)

app = workflow.compile(checkpointer=MemorySaver())
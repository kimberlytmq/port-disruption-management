from typing import TypedDict, Dict, Any, List, Optional

class AgentState(TypedDict):
    # API Status Envelope
    status: str
    disruption_summary: Optional[str]
    
    # Input Trigger
    disruption_event: Dict[str, Any]
    
    # Activity Feed
    agent_steps: List[Dict[str, str]]
    
    # Internal State & Plan Data
    impact_graph: Optional[Dict[str, Any]]
    candidate_plans: Optional[List[Dict[str, Any]]]
    plan_kpis: Optional[Dict[str, Any]]
    
    # Output
    recommended_plan: Optional[Dict[str, Any]]
    final_explanation: Optional[str]
    
    # Human-in-the-Loop Status
    human_approval: Optional[bool]
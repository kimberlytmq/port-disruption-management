"""Tools for schedule optimization."""

def generate_recovery_plans(event_payload: dict) -> dict:
    """
    Mock optimizer that deterministically sorts candidate plans 
    by their primary KPI (avg_waiting_hours).
    """
    # Raw mock data
    plans = [
        {"plan_id": "PLAN_A_PUSH", "description": "Push all vessels back by 4 hours."},
        {"plan_id": "PLAN_B_SWAP", "description": "Swap berth allocation for Vessel A and B."}
    ]
    
    kpis = {
        "PLAN_A_PUSH": {"avg_waiting_hours": 4.5, "berth_utilization": 78.0, "crane_idle_pct": 22.0},
        "PLAN_B_SWAP": {"avg_waiting_hours": 1.2, "berth_utilization": 85.5, "crane_idle_pct": 14.0}
    }
    
    # 1. Deterministic Math: Sort plans strictly by lowest waiting hours
    sorted_plans = sorted(plans, key=lambda p: kpis[p["plan_id"]]["avg_waiting_hours"])
    
    return {
        "plans": sorted_plans,
        "plan_kpis": kpis
    }
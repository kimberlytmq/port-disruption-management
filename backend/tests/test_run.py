import os
from dotenv import load_dotenv
from typing import cast
from app.agents.graph import app
from app.agents.state import AgentState

# Load your Groq API Key
load_dotenv()

def main():
    print("🚀 Starting Spec-Compliant Port Disruption Recovery Agent Test...\n")
    
    # 1. Define a mock disruption event strictly matching the new AgentState
    initial_state = cast(AgentState, {
        "status": "in_progress",
        "disruption_summary": "Processing 1 disruption event(s)...",
        "disruption_event": {
            "scenario": "ETA Delay Test",
            "events": [
                {
                    "type": "VESSEL_DELAY",
                    "vessel_id": "VESSEL_A",
                    "delay_hours": 6.0
                }
            ]
        },
        "agent_steps": [],
        "impact_graph": None,
        "candidate_plans": None,
        "plan_kpis": None,
        "recommended_plan": None,
        "final_explanation": None,
        "human_approval": None
    })
    
    # 2. Run the graph! 
    # This executes all 8 steps from start to finish
    final_state = app.invoke(initial_state)
    
    # 3. Print the formatted results
    print("\n✅ PIPELINE COMPLETE!\n")
    
    print(f"--- 📊 FINAL STATUS: {final_state.get('status')} ---")
    
    print("\n--- 📋 ACTIVITY FEED (For Next.js) ---")
    for step in final_state.get("agent_steps", []):
        print(f"[{step['step'].upper()}]: {step['summary']}")
        
    print("\n--- 🎯 RECOMMENDED PLAN ---")
    plan = final_state.get("recommended_plan")
    print(plan if plan else "No plan recommended.")
    
    print("\n--- 🤖 AI EXPLANATION ---")
    print(final_state.get("final_explanation", "No explanation generated."))

if __name__ == "__main__":
    main()
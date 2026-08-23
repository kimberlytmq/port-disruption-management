import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from .state import AgentState

def recommend_plan(state: AgentState) -> AgentState:
    # 1. Force load the .env right before we need it
    load_dotenv()
    
    # 2. Initialize the LLM here so it catches the loaded API key
    llm = ChatGroq(model="openai/gpt-oss-120b", temperature=0.0)
    
    disruption = state.get("disruption_event", {})
    plans = state.get("candidate_plans", [])
    kpis = state.get("plan_kpis", {})
    
    # Extract the deterministically sorted winner
    recommended_plan = plans[0] if plans else None
    
    prompt_template = PromptTemplate(
        input_variables=["disruption", "plans", "kpis", "recommended"],
        template="""
        You are an expert port operations duty planner.
        A disruption has occurred: {disruption}
        
        The optimizer generated these candidate recovery plans:
        {plans}
        
        Here are the exact computed KPIs for each plan:
        {kpis}
        
        The deterministic optimizer has already selected {recommended} as the mathematically optimal choice.
        
        Your task: Write a clear, plain-English recommendation explaining WHY this top plan won. 
        Compare it briefly to the alternatives using ONLY the provided KPIs. 
        DO NOT invent, guess, or hallucinate any numbers.
        """
    )
    
    final_prompt = prompt_template.format(
        disruption=disruption,
        plans=plans,
        kpis=kpis,
        recommended=recommended_plan
    )
    
    if plans:
        response = llm.invoke(final_prompt)
        explanation = str(response.content)
    else:
        explanation = "No alternative plans were generated to evaluate."
        
    state.setdefault("agent_steps", []).append({
        "step": "recommend_plan",
        "summary": "Evaluated KPIs and generated final natural-language recommendation."
    })
    
    state["recommended_plan"] = recommended_plan
    state["final_explanation"] = explanation
    
    return state
"""Tools for terminal operations."""
# backend/app/tools/terminal_tools.py

def assess_disruption(event_payload: dict) -> dict:
    """
    STUB: This is a placeholder tool for the Impact Agent.
    TODO: Replace this dictionary with the actual API call 
    to the terminal operating system simulator.
    """
    print("🔧 TOOL CALLED: assess_disruption (Using mock data)")
    
    return {
        "affected_berths": ["B01"],
        "delayed_downstream_vessels": ["VESSEL_B"],
        "yard_congestion_warning": True
    }
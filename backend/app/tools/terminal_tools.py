"""Tools for terminal operations."""
# backend/app/tools/terminal_tools.py

from pathlib import Path
import json

# Same pattern as optimisation_tools.py: backend/app/tools/terminal_tools.py
# -> parents[3] is the repo root, so this always finds scenarios/baseline.json
# regardless of what directory the server was started from.
_BASELINE_PATH = Path(__file__).resolve().parents[3] / "scenarios" / "baseline.json"


def get_terminal_state() -> dict:
    """
    Loads the current terminal state (berths, vessels, cranes) from the
    baseline scenario file. This is the real replacement for the old
    hardcoded '/terminal-state' placeholder in main.py.
    """
    with _BASELINE_PATH.open() as source:
        return json.load(source)


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
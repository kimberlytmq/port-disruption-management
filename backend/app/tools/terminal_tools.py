"""Tools for terminal operations."""
# backend/app/tools/terminal_tools.py

from pathlib import Path
import json

# Same pattern as optimisation_tools.py: backend/app/tools/terminal_tools.py
# -> parents[3] is the repo root, so this always finds scenarios/baseline.json
# regardless of what directory the server was started from.
_BASELINE_PATH = Path(__file__).resolve().parents[3] / "scenarios" / "baseline.json"

# Cached copy of the terminal state, loaded once and reused. This is the
# same object every lookup function below reads from — cheap to call
# get_terminal_state() as many times as needed, since after the first
# call it's just returning this dict, not re-reading the file. It also
# means step 5 (apply_recovery_plan) can mutate this same cached object
# directly, and every lookup here will immediately see the change.
_terminal_state: dict | None = None


def get_terminal_state() -> dict:
    """
    Returns the current terminal state (berths, vessels, cranes).
    Loads scenarios/baseline.json on the first call only; every call
    after that returns the same cached dict instead of re-reading the file.
    """
    global _terminal_state
    if _terminal_state is None:
        with _BASELINE_PATH.open() as source:
            _terminal_state = json.load(source)
    return _terminal_state


def get_vessel(vessel_id: str) -> dict | None:
    """Returns one vessel's data by id, or None if it doesn't exist."""
    state = get_terminal_state()
    for vessel in state.get("vessels", []):
        if vessel["id"] == vessel_id:
            return vessel
    return None


def get_berth_schedule() -> list:
    """Returns the current list of berths and what's assigned to each."""
    state = get_terminal_state()
    return state.get("berths", [])


def get_crane_availability() -> dict:
    """
    Returns a simple {crane_id: {berth_id, status}} map built from the
    berths' crane lists. There's no real-time crane sensor data in this
    synthetic terminal, so every crane is reported "available" — this
    keeps the shape realistic for whoever builds a crane-failure check
    on top of it later, without inventing data we don't actually have.
    """
    state = get_terminal_state()
    cranes = {}
    for berth in state.get("berths", []):
        for crane_id in berth.get("cranes", []):
            cranes[crane_id] = {"berth_id": berth["id"], "status": "available"}
    return cranes


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
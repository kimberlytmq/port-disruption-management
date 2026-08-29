"""Tools for terminal operations."""
# backend/app/tools/terminal_tools.py

from pathlib import Path
import json
from datetime import datetime, timedelta

from app.models.schedule import ScheduleEntry

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

def reset_applied_schedule() -> None:
    state = get_terminal_state()
    state.pop("schedule", None)
    for vessel in state.get("vessels", []):
        vessel.pop("assigned_berth", None)
        vessel.pop("scheduled_start", None)
        vessel.pop("scheduled_end", None)

def apply_recovery_plan(plan: dict) -> dict:
    """
    Applies an approved recovery plan to the live terminal state.

    Mutates the SAME cached dict that get_terminal_state() returns, so
    any call to /terminal-state after this will show the change directly.
    """
    state = get_terminal_state()
    raw_schedule = plan.get("schedule", [])

    # Validate every entry against the real ScheduleEntry model
    # (app/models/schedule.py) before writing anything into the shared
    # terminal state. This catches a malformed optimizer/plan output
    # (missing field, bad datetime, wrong type) immediately with a clear
    # error, instead of writing a broken entry into shared state that
    # then confuses something downstream much later.
    validated_entries = [ScheduleEntry(**entry) for entry in raw_schedule]
    schedule = [entry.model_dump(mode="json") for entry in validated_entries]

    # Record the applied schedule directly on the terminal state.
    state["schedule"] = schedule

    # Update each vessel's assigned berth so a glance at /terminal-state
    # shows where it actually ended up, not just the original baseline.
    vessel_by_id = {v["id"]: v for v in state.get("vessels", [])}
    for entry in schedule:
        vessel = vessel_by_id.get(entry.get("vessel_id"))
        if vessel:
            vessel["assigned_berth"] = entry.get("berth_id")
            vessel["scheduled_start"] = entry.get("start_time")
            vessel["scheduled_end"] = entry.get("end_time")

    return state


def _parse_iso(value):
    """Safely parses an ISO datetime string; returns None if missing/invalid."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def assess_disruption(event_payload: dict) -> dict:
    """
    Determines which berths and vessels are plausibly affected by the
    REAL disruption event(s) passed in, using the actual terminal data —
    replacing the old stub that always returned the same hardcoded answer
    no matter what event it was given.

    event_payload is the full {"scenario": ..., "events": [...]} shape
    (see specs.md section 7/8), since that's what the Impact Agent passes
    in directly from state["disruption_event"].
    """
    state = get_terminal_state()
    all_vessels = state.get("vessels", [])
    all_berths = get_berth_schedule()

    affected_berths: set[str] = set()
    delayed_downstream_vessels: set[str] = set()
    yard_congestion_warning = False

    for event in event_payload.get("events", []):
        event_type = event.get("type")

        if event_type == "VESSEL_DELAY":
            vessel_id = event.get("vessel_id")
            vessel = get_vessel(vessel_id) if vessel_id else None
            if not vessel:
                continue

            # Any berth physically long enough to take this vessel is a
            # candidate for disruption, since we don't have a fixed
            # vessel->berth assignment stored anywhere (the optimizer
            # decides that dynamically, not the static terminal data).
            for berth in all_berths:
                if berth["length"] >= vessel["length"]:
                    affected_berths.add(berth["id"])

            # Downstream vessels: anything else whose ETA falls inside
            # the gap this delay just opened up (old ETA -> new ETA) is
            # a vessel whose plans now overlap with this one's.
            old_eta = _parse_iso(event.get("old_eta")) or _parse_iso(vessel.get("eta"))
            new_eta = _parse_iso(event.get("new_eta"))
            if new_eta is None and old_eta and event.get("delay_hours") is not None:
                new_eta = old_eta + timedelta(hours=event["delay_hours"])

            if old_eta and new_eta:
                for other in all_vessels:
                    if other["id"] == vessel_id:
                        continue
                    other_eta = _parse_iso(other.get("eta"))
                    if other_eta and old_eta <= other_eta <= new_eta:
                        delayed_downstream_vessels.add(other["id"])

        elif event_type == "CRANE_FAILURE":
            crane_id = event.get("crane_id")
            crane_info = get_crane_availability().get(crane_id) if crane_id else None
            if not crane_info:
                continue

            affected_berth_id = crane_info["berth_id"]
            affected_berths.add(affected_berth_id)
            affected_berth = next((b for b in all_berths if b["id"] == affected_berth_id), None)

            # Downstream vessels: anything compatible with the affected
            # berth whose ETA falls between the failure and its expected
            # repair time — they're the ones that could actually be
            # waiting on this specific crane.
            failure_time = _parse_iso(event.get("time"))
            repair_time = _parse_iso(event.get("expected_repair_time"))
            if affected_berth and failure_time and repair_time:
                for vessel in all_vessels:
                    vessel_eta = _parse_iso(vessel.get("eta"))
                    if (
                        vessel_eta
                        and failure_time <= vessel_eta <= repair_time
                        and vessel["length"] <= affected_berth["length"]
                    ):
                        delayed_downstream_vessels.add(vessel["id"])

        elif event_type == "YARD_CONGESTION":
            # Known gap (see specs.md section 7): there's no real yard
            # capacity model in this terminal yet, so this just raises
            # the flag rather than inventing berth/vessel specifics.
            yard_congestion_warning = True

    return {
        "affected_berths": sorted(affected_berths),
        "delayed_downstream_vessels": sorted(delayed_downstream_vessels),
        "yard_congestion_warning": yard_congestion_warning,
    }
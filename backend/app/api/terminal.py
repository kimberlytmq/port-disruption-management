"""Terminal API routes."""
from fastapi import APIRouter, HTTPException

from app.tools.terminal_tools import get_terminal_state as _get_terminal_state
from app.models import Berth

router = APIRouter()


@router.get("/terminal-state")
async def get_terminal_state():
    """Returns the real current terminal state (berths, vessels, cranes)."""
    try:
        state = _get_terminal_state()
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="scenarios/baseline.json not found — check the repo layout."
        )

    # Validate berths against the real Berth model (app/models/berth.py)
    # instead of returning them as untyped dicts — a malformed
    # baseline.json (missing field, wrong type) now fails with a clear
    # Pydantic error instead of silently reaching the frontend.
    #
    # Vessels are deliberately NOT run through the Vessel model here.
    # apply_recovery_plan (terminal_tools.py) adds assigned_berth,
    # scheduled_start, and scheduled_end onto each vessel after a plan
    # is approved — fields the strict Vessel model doesn't declare.
    # Pydantic silently drops undeclared fields on serialization, so
    # doing this would erase exactly the change the earlier steps make visible.
    try:
        validated_berths = [Berth(**b).model_dump() for b in state.get("berths", [])]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invalid berth data in baseline.json: {e}")

    return {**state, "berths": validated_berths}
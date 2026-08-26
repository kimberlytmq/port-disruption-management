"""Terminal API routes."""
from fastapi import APIRouter, HTTPException

from app.tools.terminal_tools import get_terminal_state as _get_terminal_state

router = APIRouter()


@router.get("/terminal-state")
async def get_terminal_state():
    """Returns the real current terminal state (berths, vessels, cranes)."""
    try:
        return _get_terminal_state()
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="scenarios/baseline.json not found — check the repo layout."
        )

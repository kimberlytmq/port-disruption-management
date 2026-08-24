"""Agent-facing tools for schedule optimisation."""

from pathlib import Path
import json

from app.optimizer.berth_scheduler import optimize_schedule


_BASELINE_PATH = Path(__file__).resolve().parents[3] / "scenarios" / "baseline.json"


def generate_recovery_plans(event_payload: dict, terminal_state: dict | None = None) -> dict:
    """Generate and rank recovery plans using the CP-SAT scheduler.

    ``terminal_state`` is injectable for API callers and tests.  The temporary
    baseline fallback keeps the existing agent's one-argument call stable.
    """
    if terminal_state is None:
        with _BASELINE_PATH.open() as source:
            terminal_state = json.load(source)
    result = optimize_schedule(terminal_state, event_payload)
    plans = sorted(result["plans"], key=lambda plan: (result["metrics"][plan["plan_id"]]["avg_waiting_hours"], plan["plan_id"]))
    return {"plans": plans, "plan_kpis": result["metrics"]}

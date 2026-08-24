"""Tests for the deterministic CP-SAT berth scheduler."""

from datetime import datetime
from pathlib import Path
import json

from app.optimizer.berth_scheduler import optimize_schedule


ROOT = Path(__file__).resolve().parents[2]


def _baseline() -> dict:
    return json.loads((ROOT / "scenarios" / "baseline.json").read_text())


def test_schedule_is_feasible_and_metrics_are_computed():
    result = optimize_schedule(_baseline())

    assert result["plans"]
    plan = result["plans"][0]
    assert {entry["vessel_id"] for entry in plan["schedule"]} == {"VESSEL_A", "VESSEL_B", "VESSEL_C", "VESSEL_D"}
    assert set(result["metrics"][plan["plan_id"]]) == {"avg_waiting_hours", "berth_utilization", "crane_idle_pct"}

    for berth_id in {entry["berth_id"] for entry in plan["schedule"]}:
        intervals = sorted((entry for entry in plan["schedule"] if entry["berth_id"] == berth_id), key=lambda entry: entry["start_time"])
        assert all(datetime.fromisoformat(left["end_time"]) <= datetime.fromisoformat(right["start_time"]) for left, right in zip(intervals, intervals[1:]))


def test_vessel_delay_is_applied_and_result_is_deterministic():
    event = json.loads((ROOT / "scenarios" / "eta_delay.json").read_text())
    first = optimize_schedule(_baseline(), event)
    second = optimize_schedule(_baseline(), event)

    assert first == second
    a_assignment = next(entry for entry in first["plans"][0]["schedule"] if entry["vessel_id"] == "VESSEL_A")
    assert datetime.fromisoformat(a_assignment["start_time"]) >= datetime.fromisoformat("2026-08-21T14:00:00")


def test_incompatible_vessel_fails_with_a_useful_error():
    state = _baseline()
    state["vessels"][0]["length"] = 999

    try:
        optimize_schedule(state)
    except ValueError as error:
        assert "No compatible operational berth" in str(error)
    else:
        raise AssertionError("Expected an incompatible vessel to be rejected")

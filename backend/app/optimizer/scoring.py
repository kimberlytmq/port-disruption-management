"""Deterministic KPI calculation for optimiser output."""

from __future__ import annotations

from datetime import datetime
from typing import Any


def calculate_metrics(schedule: list[dict[str, Any]], state: dict[str, Any]) -> dict[str, float]:
    if not schedule:
        return {"avg_waiting_hours": 0.0, "berth_utilization": 0.0, "crane_idle_pct": 100.0}
    vessels = {v["id"]: v for v in state["vessels"]}
    starts = [datetime.fromisoformat(item["start_time"]) for item in schedule]
    ends = [datetime.fromisoformat(item["end_time"]) for item in schedule]
    waits = [(datetime.fromisoformat(item["start_time"]) - datetime.fromisoformat(vessels[item["vessel_id"]]["eta"])).total_seconds() / 3600 for item in schedule]
    horizon_hours = max((max(ends) - min(starts)).total_seconds() / 3600, 0.25)
    service_hours = sum((datetime.fromisoformat(item["end_time"]) - datetime.fromisoformat(item["start_time"])).total_seconds() / 3600 for item in schedule)
    down_cranes = set(state.get("down_cranes", []))
    total_cranes = sum(sum(crane not in down_cranes for crane in b.get("cranes", [])) for b in state["berths"])
    crane_hours = sum((datetime.fromisoformat(item["end_time"]) - datetime.fromisoformat(item["start_time"])).total_seconds() / 3600 * item["cranes_used"] for item in schedule)
    return {
        "avg_waiting_hours": round(sum(waits) / len(waits), 2),
        "berth_utilization": round(100 * service_hours / (horizon_hours * len(state["berths"])), 2),
        "crane_idle_pct": round(max(0, 100 * (1 - crane_hours / (horizon_hours * max(total_cranes, 1)))), 2),
    }

"""Shared deterministic scheduling assumptions and input normalisation."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
from typing import Any

TIME_UNIT_MINUTES = 15
MOVES_PER_CRANE_HOUR = 30


def parse_datetime(value: datetime | str) -> datetime:
    return value if isinstance(value, datetime) else datetime.fromisoformat(value)


def apply_disruptions(state: dict[str, Any], disruption: dict[str, Any] | None) -> dict[str, Any]:
    """Return a copy of state with ETA delays and crane outages applied.

    The optimiser intentionally works from explicit input rather than global
    state so an identical scenario always produces the same answer.
    """
    result = deepcopy(state)
    events = (disruption or {}).get("events", [])
    vessels = {v["id"]: v for v in result.get("vessels", [])}
    down_cranes = set(result.get("down_cranes", []))
    for event in events:
        if event.get("type") == "VESSEL_DELAY" and event.get("vessel_id") in vessels:
            vessel = vessels[event["vessel_id"]]
            if event.get("new_eta"):
                vessel["eta"] = event["new_eta"]
            elif event.get("delay_hours") is not None:
                vessel["eta"] = (parse_datetime(vessel["eta"]) + timedelta(hours=float(event["delay_hours"]))).isoformat()
        elif event.get("type") == "CRANE_FAILURE" and event.get("crane_id"):
            # v0 conservatively removes an affected crane for this recovery run.
            down_cranes.add(event["crane_id"])
    result["down_cranes"] = sorted(down_cranes)
    return result


def service_minutes(move_count: int, crane_count: int) -> int:
    """Round service to scheduler time buckets, avoiding fractional intervals."""
    if crane_count < 1:
        raise ValueError("A berth needs at least one available crane")
    raw_minutes = move_count * 60 / (MOVES_PER_CRANE_HOUR * crane_count)
    return max(TIME_UNIT_MINUTES, int(-(-raw_minutes // TIME_UNIT_MINUTES) * TIME_UNIT_MINUTES))

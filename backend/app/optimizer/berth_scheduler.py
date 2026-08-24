"""Deterministic OR-Tools CP-SAT berth scheduler.

The v0 model assigns every vessel to one compatible berth, starts it no earlier
than its (possibly disrupted) ETA, and prevents overlap on each berth. Service
duration is derived from move count and the number of operational cranes.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from ortools.sat.python import cp_model

from .constraints import TIME_UNIT_MINUTES, apply_disruptions, parse_datetime, service_minutes
from .scoring import calculate_metrics


_PROFILES = (
    ("PLAN_MIN_WAIT", "Minimise average vessel waiting time.", "wait"),
    ("PLAN_PRIORITY", "Protect high-priority vessel turnaround.", "priority"),
    ("PLAN_THROUGHPUT", "Minimise total schedule completion time.", "throughput"),
)


def _validate_state(state: dict[str, Any]) -> None:
    if not state.get("berths") or not state.get("vessels"):
        raise ValueError("terminal_state must contain non-empty 'berths' and 'vessels' lists")
    berth_ids = {berth["id"] for berth in state["berths"]}
    if len(berth_ids) != len(state["berths"]):
        raise ValueError("berth IDs must be unique")
    vessel_ids = {vessel["id"] for vessel in state["vessels"]}
    if len(vessel_ids) != len(state["vessels"]):
        raise ValueError("vessel IDs must be unique")


def _solve(state: dict[str, Any], objective: str) -> list[dict[str, Any]] | None:
    berths = state["berths"]
    vessels = state["vessels"]
    down_cranes = set(state.get("down_cranes", []))
    origin = min(parse_datetime(v["eta"]) for v in vessels).replace(second=0, microsecond=0)
    crane_counts = {
        berth["id"]: len([crane for crane in berth.get("cranes", []) if crane not in down_cranes])
        for berth in berths
    }
    compatible = {
        vessel["id"]: [berth for berth in berths if berth["length"] >= vessel["length"] and crane_counts[berth["id"]] > 0]
        for vessel in vessels
    }
    impossible = [vessel_id for vessel_id, choices in compatible.items() if not choices]
    if impossible:
        raise ValueError(f"No compatible operational berth for: {', '.join(sorted(impossible))}")

    # Enough horizon for every vessel to use its slowest eligible berth plus a buffer.
    latest_eta_minutes = max(int((parse_datetime(v["eta"]) - origin).total_seconds() // 60) for v in vessels)
    max_minutes = latest_eta_minutes + sum(max(service_minutes(v["move_count"], crane_counts[b["id"]]) for b in compatible[v["id"]]) for v in vessels) + 24 * 60
    horizon = -(-max_minutes // TIME_UNIT_MINUTES)
    model = cp_model.CpModel()
    intervals_by_berth: dict[str, list[Any]] = {berth["id"]: [] for berth in berths}
    choices: dict[tuple[str, str], tuple[Any, Any, int]] = {}
    chosen_starts: dict[str, Any] = {}
    chosen_ends: dict[str, Any] = {}

    for vessel in vessels:
        vessel_id = vessel["id"]
        eta_slot = max(0, int((parse_datetime(vessel["eta"]) - origin).total_seconds() // 60 // TIME_UNIT_MINUTES))
        presence_vars = []
        chosen_start = model.NewIntVar(eta_slot, horizon, f"chosen_start_{vessel_id}")
        chosen_end = model.NewIntVar(eta_slot, horizon, f"chosen_end_{vessel_id}")
        chosen_starts[vessel_id] = chosen_start
        chosen_ends[vessel_id] = chosen_end
        for berth in compatible[vessel_id]:
            berth_id = berth["id"]
            duration = service_minutes(vessel["move_count"], crane_counts[berth_id]) // TIME_UNIT_MINUTES
            start = model.NewIntVar(eta_slot, horizon - duration, f"start_{vessel_id}_{berth_id}")
            end = model.NewIntVar(eta_slot + duration, horizon, f"end_{vessel_id}_{berth_id}")
            assigned = model.NewBoolVar(f"assigned_{vessel_id}_{berth_id}")
            interval = model.NewOptionalIntervalVar(start, duration, end, assigned, f"interval_{vessel_id}_{berth_id}")
            intervals_by_berth[berth_id].append(interval)
            choices[(vessel_id, berth_id)] = (start, end, duration, assigned)
            presence_vars.append(assigned)
            model.Add(chosen_start == start).OnlyEnforceIf(assigned)
            model.Add(chosen_end == end).OnlyEnforceIf(assigned)
        model.AddExactlyOne(presence_vars)

    for intervals in intervals_by_berth.values():
        model.AddNoOverlap(intervals)

    wait_terms = []
    priority_terms = []
    for vessel in vessels:
        vessel_id = vessel["id"]
        eta_slot = max(0, int((parse_datetime(vessel["eta"]) - origin).total_seconds() // 60 // TIME_UNIT_MINUTES))
        # Subtracting the constant ETA is omitted: it cannot change the optimum.
        wait_terms.append(chosen_starts[vessel_id])
        priority_terms.append(chosen_starts[vessel_id] * (11 - min(int(vessel.get("priority", 3)), 10)))
    if objective == "priority":
        model.Minimize(sum(priority_terms) * 1000 + sum(wait_terms))
    elif objective == "throughput":
        makespan = model.NewIntVar(0, horizon, "makespan")
        for end in chosen_ends.values():
            model.Add(makespan >= end)
        model.Minimize(makespan * 1000 + sum(wait_terms))
    else:
        model.Minimize(sum(wait_terms))

    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    solver.parameters.max_time_in_seconds = 10
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None

    schedule = []
    for vessel in sorted(vessels, key=lambda item: item["id"]):
        for berth in compatible[vessel["id"]]:
            start, end, _duration, assigned = choices[(vessel["id"], berth["id"])]
            if solver.Value(assigned):
                schedule.append({
                    "berth_id": berth["id"],
                    "vessel_id": vessel["id"],
                    "start_time": (origin + timedelta(minutes=solver.Value(start) * TIME_UNIT_MINUTES)).isoformat(),
                    "end_time": (origin + timedelta(minutes=solver.Value(end) * TIME_UNIT_MINUTES)).isoformat(),
                    "cranes_used": crane_counts[berth["id"]],
                })
                break
    return sorted(schedule, key=lambda item: (item["start_time"], item["berth_id"], item["vessel_id"]))


def optimize_schedule(terminal_state: dict[str, Any], disruption: dict[str, Any] | None = None) -> dict[str, Any]:
    """Generate deterministic, feasible recovery schedule candidates.

    Input is a dictionary matching the scenario terminal-state schema.  The
    return value follows the contract in ``specs.md`` section 9.
    """
    state = apply_disruptions(terminal_state, disruption)
    _validate_state(state)
    plans: list[dict[str, Any]] = []
    metrics: dict[str, dict[str, float]] = {}
    seen: set[tuple[tuple[str, str, str], ...]] = set()
    for plan_id, description, objective in _PROFILES:
        schedule = _solve(state, objective)
        if schedule is None:
            continue
        signature = tuple((item["vessel_id"], item["berth_id"], item["start_time"]) for item in schedule)
        if signature in seen:
            continue
        seen.add(signature)
        plans.append({"plan_id": plan_id, "description": description, "schedule": schedule})
        metrics[plan_id] = calculate_metrics(schedule, state)
    if not plans:
        raise ValueError("No feasible berth schedule found")
    return {"plans": plans, "metrics": metrics}

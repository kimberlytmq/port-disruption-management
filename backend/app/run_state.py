"""
Shared in-memory run state for the hackathon MVP (no DB — see specs.md
Non-Goals for v0). Kept as its own module, rather than living inside
main.py or any one route file, because /disruptions, /approve, and
/plans (in api/disruptions.py and api/plans.py) all need to read and
write the SAME current run.

Plain module-level variables work here because every route accesses
them as run_state.active_run_state / run_state.active_thread_id —
mutating an attribute on this shared module object, rather than
reassigning a local name.
"""
from typing import Optional
from app.agents.state import AgentState

active_run_state: Optional[AgentState] = None
active_thread_id: Optional[str] = None

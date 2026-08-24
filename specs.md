# Port Disruption Recovery Agent — Specification

This is the single source of truth for what this system is and how its pieces fit together. Any AI model or teammate writing code in this repo should read this first. It describes the **target** design; the [Status Tracker](#12-status-tracker) at the bottom tracks what's actually built so far.

## 1. Problem & Solution

**Problem:** Container terminal operations run on a tight, interdependent schedule — vessels arrive at set times, occupy specific berths, get worked by specific cranes, and move cargo through the yard. An unexpected disruption (a vessel running hours late, a crane breaking down, a yard congestion spike) breaks that schedule and cascades: one delayed vessel can block a berth, which delays the next vessel, which idles cranes, which backs up the yard. Today a human planner has to manually work out the ripple effects and replan — slow, and easy to get wrong under time pressure.

**Solution:** An agentic AI system that, given a disruption event:
1. Detects what happened
2. Investigates downstream impact (berth → crane → yard → downstream vessels)
3. Calls optimization and simulation tools to generate alternative recovery schedules
4. Evaluates the trade-offs of each alternative using real computed KPIs (not LLM guesses)
5. Recommends one plan, with reasoning, expected impact, risks, and required approvals
6. Waits for a human to approve before it would be applied

The LLM's job is reasoning about *what to check and in what order* — never inventing the numbers. All KPIs (waiting time, berth utilization, etc.) come from deterministic Python/OR-Tools code.

## 2. Architecture

```
                    Next.js UI (frontend/)
                            │
                     REST / WebSocket
                            │
                            ▼
                  FastAPI Backend (backend/app/api/)
                  /disruptions  /terminal-state
                  /plans        /approve
                            │
                            ▼
              LangGraph Agent Graph (backend/app/agents/)
                       Orchestrator
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
  Impact Agent       Planning Agent       Recovery Agent
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
              Tools (backend/app/tools/)
   ┌────────────────┬────────────────┬────────────────┐
   │ Terminal State  │  OR-Tools      │  Simulator     │
   │ Tools           │  Optimizer     │                │
   │ (vessels,       │ (berth_        │ (simulation/,  │
   │  berths, cranes,│  scheduler.py) │  "what-if"     │
   │  yard)          │                │  outcomes)     │
   └────────────────┴────────────────┴────────────────┘
                            │
                            ▼
              Scenario / Data Layer (scenarios/*.json)
```

### Non-Goals for v0

Deliberately **out of scope** until the core vertical slice (Milestone 1, below) is solid:
- PostgreSQL or any persistent database — JSON files + in-memory Python objects only
- n8n workflows — trigger disruptions by calling the API directly first
- pgvector / RAG
- Authentication
- Real deployment / hosting
- Real PSA (or any real port authority) system integration

Every one of these is a thing that can break five minutes before a demo recording. Add them only after the vertical slice works end-to-end.

## 3. Repo Structure

```
port-disruption-management/
│
├── specs.md                  # this file
├── README.md
├── docker-compose.yml
├── .env.example
│
├── frontend/                  # Next.js dashboard
│   ├── app/
│   │   ├── page.tsx           # hero "Command Center" screen (see §10)
│   │   ├── terminal/          # terminal map/timeline view
│   │   ├── scenarios/         # scenario picker/loader UI
│   │   └── components/        # shared UI components
│   └── lib/                   # API client, formatting helpers
│
├── backend/                   # Python/FastAPI
│   ├── app/
│   │   ├── main.py             # FastAPI app entrypoint, mounts routers
│   │   │
│   │   ├── agents/             # LangGraph: "what should I do?"
│   │   │   ├── graph.py         # StateGraph wiring — the node sequence in §4
│   │   │   ├── state.py         # shared agent state schema
│   │   │   ├── orchestrator.py  # decides what happened, what's needed, re-optimize?
│   │   │   ├── impact_agent.py  # berth→crane→yard→downstream vessel impact graph
│   │   │   ├── planning_agent.py# calls optimizer/simulator, generates alternatives
│   │   │   └── recovery_agent.py# ranks options, produces recommendation
│   │   │
│   │   ├── tools/               # "how do I actually do it?" — see §5
│   │   │   ├── terminal_tools.py
│   │   │   ├── optimisation_tools.py
│   │   │   ├── simulation_tools.py
│   │   │   └── scenario_tools.py
│   │   │
│   │   ├── optimizer/           # OR-Tools models — see §9
│   │   │   ├── berth_scheduler.py
│   │   │   ├── constraints.py
│   │   │   └── scoring.py
│   │   │
│   │   ├── simulation/          # deterministic "what-if" terminal environment
│   │   │   ├── terminal.py       # simulated terminal state
│   │   │   ├── disruptions.py    # injects disruption events into state
│   │   │   └── evaluator.py      # computes KPIs for a given plan
│   │   │
│   │   ├── models/               # Pydantic schemas — see §6
│   │   │   ├── vessel.py, berth.py, crane.py, yard.py, schedule.py
│   │   │
│   │   └── api/                  # FastAPI routes — see §8
│   │       ├── disruptions.py, terminal.py, plans.py
│   │
│   ├── tests/
│   └── requirements.txt
│
├── scenarios/                  # synthetic demo data — see §7
│   ├── baseline.json
│   ├── eta_delay.json
│   ├── crane_failure.json
│   └── compound_disruption.json
│
└── docs/
    ├── architecture.md
    ├── product-concept.md
    └── demo-script.md
```

## 4. Agent Design (`backend/app/agents/`)

Four agents, each with one job:

| Agent | File | Responsibility |
|---|---|---|
| **Orchestrator** | `orchestrator.py` | The brain. Determines: what happened? what information do I need? which tools should I call? do I need to re-optimize? |
| **Impact** | `impact_agent.py` | Checks berth → crane → yard → downstream vessels. Outputs an impact graph. |
| **Planning** | `planning_agent.py` | Calls the optimizer/simulator tools and generates alternative recovery plans. |
| **Recovery** | `recovery_agent.py` | Ranks the alternatives and produces: recommended action, why, expected impact, risks, required approvals. |

### LangGraph node sequence (`graph.py`)

```
START
  → detect_disruption
  → assess_impact
  → generate_candidates
  → simulate_candidates
  → evaluate_candidates
  → recommend_plan
  → human_approval        (blocks until a human approves/rejects via POST /approve)
  → apply_plan
  → END
```

This is intentionally four agents, not an open-ended multi-agent system — enough to demonstrate real agentic behavior (tool selection, sequential reasoning, re-optimization) without becoming unmaintainable.

## 5. Tool Contract (`backend/app/tools/`)

Agents only ever affect the world by calling these tools. Every tool signature below is the contract other components build against — define it once, keep the signature stable, wire the real implementation in behind it.

| Tool | Input | Output | Notes |
|---|---|---|---|
| `get_vessel(vessel_id)` | vessel id | `Vessel` | terminal_tools.py |
| `get_terminal_state()` | — | full current state (berths, vessels, cranes, yard) | terminal_tools.py |
| `get_berth_schedule()` | — | current berth assignments/timeline | terminal_tools.py |
| `get_crane_availability()` | — | crane status per berth | terminal_tools.py |
| `assess_disruption(event)` | disruption event | impact graph (what's affected, how) | terminal_tools.py / impact_agent |
| `generate_recovery_plans(event)` | disruption event | 2–5 candidate `Plan` objects | optimisation_tools.py, calls optimizer/ |
| `simulate_plan(plan_id)` | plan id | KPIs for that plan | simulation_tools.py, calls simulation/ |
| `optimize_berth_schedule()` | terminal state + constraints | feasible schedule + KPIs | optimisation_tools.py, calls optimizer/berth_scheduler.py |
| `apply_recovery_plan(plan_id)` | plan id | confirmation / new terminal state | terminal_tools.py — only called after human approval |

**Rule:** the optimizer and simulator produce all numeric KPIs. The LLM reasons over tool outputs and explains them in natural language — it never generates a waiting-time or utilization figure itself.

## 6. Data Models (`backend/app/models/`)

Pydantic schemas, inferred from the scenario examples in §7:

**Vessel** (`vessel.py`)
```python
id: str
eta: datetime
move_count: int          # number of container moves required
length: float             # meters
priority: int              # lower = higher priority, or vice versa — define explicitly in code
```

**Berth** (`berth.py`)
```python
id: str
length: float              # meters — must be >= vessel.length to accept it
cranes: list[str]          # crane IDs assigned to this berth
```

**Crane** (`crane.py`)
```python
id: str
berth_id: str | None
status: Literal["available", "in_use", "down"]
```

**Yard** (`yard.py`)
```python
id: str
capacity: int
current_utilization: float
```

**Schedule** (`schedule.py`)
```python
berth_id: str
vessel_id: str
start_time: datetime
end_time: datetime
```

## 7. Scenario File Schema (`scenarios/`)

Two kinds of scenario file. **The files currently on disk (`baseline.json`, `eta_delay.json`, `crane_failure.json`, `compound_disruption.json`) only have `{name, description, disruptions: []}` with empty arrays — they need to be populated to match the schemas below.**

**Terminal state file** (e.g. `baseline.json`) — describes the terminal itself:
```json
{
  "berths": [
    { "id": "B01", "length": 400, "cranes": ["QC01", "QC02", "QC03"] },
    { "id": "B02", "length": 350, "cranes": ["QC04", "QC05"] }
  ],
  "vessels": [
    { "id": "VESSEL_A", "eta": "2026-08-21T10:00:00", "move_count": 1800, "length": 300, "priority": 2 },
    { "id": "VESSEL_B", "eta": "2026-08-21T13:00:00", "move_count": 900, "length": 250, "priority": 1 }
  ]
}
```

**Disruption event file** (e.g. `eta_delay.json`) — describes what goes wrong, referencing the baseline terminal rather than duplicating it:
```json
{
  "scenario": "ETA Delay",
  "events": [
    {
      "time": "2026-08-21T09:30:00",
      "type": "VESSEL_DELAY",
      "vessel_id": "VESSEL_A",
      "old_eta": "2026-08-21T10:00:00",
      "new_eta": "2026-08-21T14:00:00"
    }
  ]
}
```

Other `type` values follow the same shape convention: `CRANE_FAILURE` (fields: `crane_id`, `time`, `expected_repair_time`), and `compound_disruption.json` is simply an `events` array with more than one event.

## 8. API Contract (`backend/app/api/`)

| Endpoint | Method | Request | Response |
|---|---|---|---|
| `/disruptions` | POST | disruption event (§7 shape) | triggers the agent graph, returns run id / initial status |
| `/terminal-state` | GET | — | current `get_terminal_state()` output |
| `/plans` | GET | — | latest candidate plans + recommendation for the active run |
| `/approve` | POST | `{ plan_id, approved: bool }` | unblocks `human_approval` node, triggers `apply_plan` if approved |

Response shape for a completed agent run (what the frontend polls/subscribes to):
```json
{
  "status": "completed",
  "recommended_plan": { "...": "Plan object" },
  "agent_steps": [
    { "step": "detect_disruption", "summary": "..." },
    { "step": "assess_impact", "summary": "..." }
  ]
}
```

## 9. Optimizer Output Contract

`optimizer/berth_scheduler.py` (OR-Tools) exposes:
```python
result = optimize_schedule(terminal_state, disruption)
# result = {
#   "plans": [ { "plan_id": "...", "schedule": [...] }, ... ],
#   "metrics": {
#     "plan_id": { "avg_waiting_hours": float, "berth_utilization": float, "crane_idle_pct": float }
#   }
# }
```

**Determinism requirement:** for a given scenario file, the optimizer and simulator must return the same plans and KPIs every run. The LLM's narration on top can vary; the underlying numbers must not — this is what makes a demo recording repeatable.

## 10. Frontend Requirements (`frontend/`)

One hero screen — a "Port Operations Command Center" — rather than many pages:

- **Disruption alert banner** — what happened, in plain language (e.g. "VESSEL_A ETA delay: +4 hours")
- **Berth timeline / Gantt** — current schedule per berth
- **Agent activity feed** — live checklist of what the agent is doing (detected disruption → assessed impact → generated N plans → simulated outcomes)
- **Recovery plan comparison** — recommended plan plus before/after KPIs (waiting time, berth utilization, crane idle time)
- **Approve / Reject** action — calls `POST /approve`

## 11. Milestones

1. **M1 — Vertical slice:** one disruption scenario works end-to-end with no UI polish: `eta_delay.json` → `POST /disruptions` → agent graph → optimizer → a recommendation printed/returned as JSON.
2. **M2 — Three scenarios:** ETA delay, crane failure, and compound disruption all produce sensible recommendations.
3. **M3 — Dashboard:** frontend shows current plan, disruption, agent actions, candidate plans, recommendation, and KPIs per §10.
4. **M4 — Demo polish:** deterministic scenario outcomes (see §9), agent activity animations, before/after comparison, human approval flow, scenario reset, basic error handling.

## 12. Status Tracker

Seeded from a repo audit on 2026-08-22. **Update this table as work lands — it does not track itself.**

| Component | Path | Status |
|---|---|---|
| FastAPI app + `/health` | `backend/app/main.py` | Done (placeholder scope only) |
| Frontend homepage | `frontend/app/page.tsx` | Done (static placeholder only) |
| Orchestrator agent | `backend/app/agents/orchestrator.py` | Not Started |
| Impact agent | `backend/app/agents/impact_agent.py` | Not Started |
| Planning agent | `backend/app/agents/planning_agent.py` | Not Started |
| Recovery agent | `backend/app/agents/recovery_agent.py` | Not Started |
| LangGraph wiring | `backend/app/agents/graph.py`, `state.py` | Not Started |
| Terminal tools | `backend/app/tools/terminal_tools.py` | Not Started |
| Optimisation tools | `backend/app/tools/optimisation_tools.py` | Done — loads baseline state and exposes deterministic recovery-plan candidates |
| Simulation tools | `backend/app/tools/simulation_tools.py` | Not Started |
| Scenario tools | `backend/app/tools/scenario_tools.py` | Not Started |
| Berth scheduler (OR-Tools) | `backend/app/optimizer/berth_scheduler.py`, `constraints.py`, `scoring.py` | Done — CP-SAT berth assignment, no-overlap, ETA-delay/crane-outage inputs, KPIs |
| Simulation engine | `backend/app/simulation/terminal.py`, `disruptions.py`, `evaluator.py` | Not Started |
| Data models | `backend/app/models/*.py` | Partial — vessel, berth, crane and schedule schemas are implemented |
| API routes | `backend/app/api/disruptions.py`, `terminal.py`, `plans.py` | Not Started (files exist, not wired into `main.py`) |
| Scenario data | `scenarios/*.json` | Partial — baseline terminal state and three disruption event files are populated |
| Frontend terminal/scenario views + components | `frontend/app/terminal/`, `frontend/app/scenarios/`, `frontend/app/components/` | Not Started (empty dirs) |
| Tests | `backend/tests/*.py` | Partial — deterministic scheduler feasibility and disruption tests added |
| `docs/architecture.md`, `product-concept.md`, `demo-script.md` | `docs/` | Not Started (1-line stubs) |

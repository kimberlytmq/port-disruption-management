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

**As implemented:** `graph.py` wires all 8 nodes exactly in this order and compiles with plain `StateGraph(...).compile()`. `detect_disruption`, `assess_impact`, and `generate_candidates` call real tool functions (§5); `simulate_candidates` and `evaluate_candidates` are currently placeholder nodes that only append a log entry to `agent_steps` — they don't call `simulation/` or produce real KPIs yet. `human_approval` is also placeholder: it logs "awaiting approval" but does **not** actually pause the graph — `apply_plan` runs immediately after in the same synchronous call. This means `POST /approve` currently just records a flag on `active_run_state` after the fact; it doesn't gate execution. Fixing this (e.g. via LangGraph's `interrupt_before`, or splitting the graph into two invocations around `human_approval`) is needed before the approval step is real.

**Agent State (`state.py`)** — the actual shared `AgentState` TypedDict every node reads/writes:
```python
class AgentState(TypedDict):
    status: str                                   # "in_progress" | "completed"
    disruption_summary: Optional[str]
    disruption_event: Dict[str, Any]              # raw DisruptionPayload, see §7/§8
    agent_steps: List[Dict[str, str]]             # [{ "step": ..., "summary": ... }, ...] — drives the frontend activity feed
    impact_graph: Optional[Dict[str, Any]]
    candidate_plans: Optional[List[Dict[str, Any]]]
    plan_kpis: Optional[Dict[str, Any]]
    recommended_plan: Optional[Dict[str, Any]]
    final_explanation: Optional[str]               # LLM-written narration, see below
    human_approval: Optional[bool]
```

**Recovery agent LLM:** `recommend_plan` calls **Groq** (`langchain-groq`, model `openai/gpt-oss-120b`, `temperature=0.0`) to turn the already-decided plan + KPIs into a plain-English explanation — it does not pick the plan (the optimizer tool's deterministic sort already did that) and is prompted explicitly not to invent numbers, consistent with the rule in §5. Requires a `GROQ_API_KEY` loaded via `python-dotenv`/`.env`. **`.env.example` still only has `API_HOST`/`API_PORT` — add `GROQ_API_KEY=` to it.**

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

**As implemented today, only two of these nine tools exist, and both are hardcoded mocks:**
- `assess_disruption(event_payload)` (`terminal_tools.py`) — ignores its input entirely and always returns the same fixed dict (`affected_berths: ["B01"]`, `delayed_downstream_vessels: ["VESSEL_B"]`, `yard_congestion_warning: true`). Explicitly marked `STUB`/`TODO` in the code — needs to actually read terminal state and compute impact from the real event.
- `generate_recovery_plans(event_payload)` (`optimisation_tools.py`) — also ignores its input; returns two hardcoded plans (`PLAN_A_PUSH`, `PLAN_B_SWAP`) with hardcoded KPIs, sorted deterministically by `avg_waiting_hours`. Satisfies the determinism requirement (§9) but does not call `optimizer/berth_scheduler.py` or OR-Tools at all, despite `ortools` being a dependency.
- `get_vessel`, `get_terminal_state`, `get_berth_schedule`, `get_crane_availability`, `simulate_plan`, `optimize_berth_schedule`, `apply_recovery_plan` — none of these exist yet.

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

**⚠️ Superseded by the shipped API contract.** `POST /disruptions` (§8) now validates incoming events with a Pydantic model that uses a flatter, different shape than the one above — `time`/`old_eta`/`new_eta` are dropped in favor of a single `delay_hours`, and a third event type was added:
```json
{
  "scenario": "ETA Delay Test",
  "events": [
    { "type": "VESSEL_DELAY", "vessel_id": "VESSEL_A", "delay_hours": 6.0 }
  ]
}
```
Allowed `type` values are now exactly `VESSEL_DELAY`, `CRANE_FAILURE`, `YARD_CONGESTION` (enforced — any other value is rejected with a validation error); `crane_id` is used for `CRANE_FAILURE` events. **This is the real, enforced contract going forward — populate `scenarios/*.json` event files to match this shape, not the `old_eta`/`new_eta` shape shown above.** The terminal-state file shape (`berths`/`vessels`) above is unaffected and still the target.

## 8. API Contract (`backend/app/api/`)

| Endpoint | Method | Request | Response |
|---|---|---|---|
| `/disruptions` | POST | disruption event (§7 shape) | triggers the agent graph, returns run id / initial status |
| `/terminal-state` | GET | — | current `get_terminal_state()` output |
| `/plans` | GET | — | latest candidate plans + recommendation for the active run |
| `/approve` | POST | `{ plan_id, approved: bool }` | unblocks `human_approval` node, triggers `apply_plan` if approved |

**As implemented (`backend/app/main.py`):** all four routes plus `/health` live directly in `main.py` — the route modules under `app/api/` (§3) still exist as empty stubs and aren't imported/mounted. Split the logic out into `app/api/disruptions.py`, `terminal.py`, `plans.py` per the target structure when convenient; not urgent for the hackathon.

Real request/response shapes in the current code:
- `POST /disruptions` body is `{ scenario?: string, events: [DisruptionEventDetail] }` (min 1 event) using the event shape in §7's "superseded" block — invalid `type` values are rejected with a 422 before the agent even runs. The pipeline runs **synchronously inside the request** (`agent_graph.invoke(...)`) and the response is:
  ```json
  {
    "status": "completed",
    "disruption_summary": "Processing 1 disruption event(s)...",
    "recommended_plan": { "...": "Plan object" },
    "agent_steps": [
      { "step": "detect_disruption", "summary": "..." },
      { "step": "assess_impact", "summary": "..." }
    ]
  }
  ```
- `POST /approve` body is `{ plan_id: string, approved: bool }`; response is `{ status: "approved"|"rejected", plan_id, message }`. As noted in §4, this currently just records the decision on the one global `active_run_state` — it does not gate `apply_plan`, since the graph has already finished running by the time this is called.
- `GET /terminal-state` is a **stub** — always returns `{ "status": "ok", "message": "Terminal state data placeholder" }` regardless of real state.
- `GET /plans` returns `{ candidate_plans, plan_kpis, recommended_plan }` for whatever run is in `active_run_state` (empty defaults if none has run yet).
- State is held in one process-global `active_run_state` variable (no DB, no per-session/per-run IDs yet) — fine for a single-demo MVP, but means only one run can be tracked at a time.

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

Seeded from a repo audit on 2026-08-22; updated 2026-08-23 after PR #2 (`feature/langgraph-agent`, by aditig0305) landed the first real agent pipeline. **Update this table as work lands — it does not track itself.**

| Component | Path | Status |
|---|---|---|
| FastAPI app + `/health`, `/disruptions`, `/approve`, `/terminal-state`, `/plans` | `backend/app/main.py` | Done — all routes implemented directly in `main.py` (not split into `app/api/*` yet, see §8) |
| Frontend homepage | `frontend/app/page.tsx` | Done (static placeholder only) |
| LangGraph wiring (all 8 nodes + edges) | `backend/app/agents/graph.py` | Done |
| Agent state schema | `backend/app/agents/state.py` | Done — see the `AgentState` TypedDict in §4 |
| Orchestrator agent (`detect_disruption`) | `backend/app/agents/orchestrator.py` | Done |
| Impact agent (`assess_impact`) | `backend/app/agents/impact_agent.py` | Done — but calls a hardcoded-mock tool, see §5 |
| Planning agent (`generate_candidates`) | `backend/app/agents/planning_agent.py` | Done — but calls a hardcoded-mock tool, see §5 |
| Recovery agent (`recommend_plan`) | `backend/app/agents/recovery_agent.py` | Done — real Groq LLM call for narration; plan selection itself is the deterministic mock sort |
| `simulate_candidates`, `evaluate_candidates` nodes | `backend/app/agents/graph.py` | In Progress — placeholder nodes, log only, no real simulation/scoring logic yet |
| `human_approval`, `apply_plan` nodes | `backend/app/agents/graph.py` | In Progress — placeholder nodes; approval does not actually gate execution yet (see §4) |
| Terminal tools | `backend/app/tools/terminal_tools.py` | In Progress — `assess_disruption` exists but is a hardcoded stub (marked `TODO` in code); `get_vessel`, `get_terminal_state`, `get_berth_schedule`, `get_crane_availability`, `apply_recovery_plan` not started |
| Optimisation tools | `backend/app/tools/optimisation_tools.py` | In Progress — `generate_recovery_plans` exists but is a hardcoded mock, doesn't call OR-Tools; `optimize_berth_schedule` not started |
| Simulation tools | `backend/app/tools/simulation_tools.py` | Not Started |
| Scenario tools | `backend/app/tools/scenario_tools.py` | Not Started |
| Berth scheduler (OR-Tools) | `backend/app/optimizer/berth_scheduler.py`, `constraints.py`, `scoring.py` | Not Started — `ortools` is a dependency but unused anywhere in the code |
| Simulation engine | `backend/app/simulation/terminal.py`, `disruptions.py`, `evaluator.py` | Not Started |
| Data models | `backend/app/models/*.py` | Not Started — request/response validation currently lives inline in `main.py` (`DisruptionPayload`, `DisruptionEventDetail`, `ApprovalRequest`) instead |
| API routes as separate modules | `backend/app/api/disruptions.py`, `terminal.py`, `plans.py` | Not Started (files still empty stubs; logic lives in `main.py` instead, see §8) |
| Scenario data | `scenarios/*.json` | Not Started (files exist with names/descriptions only, `disruptions: []` empty — needs population per the **shipped** event schema in §7, not the earlier draft one) |
| Frontend terminal/scenario views + components | `frontend/app/terminal/`, `frontend/app/scenarios/`, `frontend/app/components/` | Not Started (empty dirs) |
| Tests | `backend/tests/*.py` | In Progress — `test_run.py` added as a manual smoke-test script (prints pipeline output, calls the real Groq API); not actual `pytest` test cases with assertions yet |
| `.env.example` | root | Needs update — missing `GROQ_API_KEY`, now required by `recovery_agent.py` |
| `docs/architecture.md`, `product-concept.md`, `demo-script.md` | `docs/` | Not Started (1-line stubs) |

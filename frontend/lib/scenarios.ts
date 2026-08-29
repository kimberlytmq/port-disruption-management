import type { Berth, DisruptionPayload, PlanKpis, RecoveryPlan, ScenarioData, ScenarioId } from "./types";
import { consequenceBeats, deriveVesselPositions, describeAction, summarizeDisruption, toDisplaySteps } from "./derive";

// Everything in this file is a snapshot of the REAL backend, not invented:
// - BERTHS is copied from scenarios/baseline.json.
// - EVENT_PAYLOADS is copied from scenarios/{eta_delay,crane_failure,compound_disruption}.json.
// - The `plans` / `metrics` per scenario were produced by actually running
//   backend/app/optimizer/berth_scheduler.optimize_schedule(...) against
//   scenarios/baseline.json + each event file (OR-Tools CP-SAT, real solve,
//   not hand-picked numbers).
// This is the fallback used when the live backend isn't reachable (see
// lib/api.ts) — same shape either way, so the UI can't tell the difference.

export const PLAN_LABELS: Record<string, string> = {
  PLAN_MIN_WAIT: "minimizes average wait",
  PLAN_PRIORITY: "protects priority vessels",
  PLAN_THROUGHPUT: "minimizes total completion time",
};

export const BERTHS: Berth[] = [
  { id: "B01", length: 400, cranes: ["QC01", "QC02", "QC03"] },
  { id: "B02", length: 350, cranes: ["QC04", "QC05"] },
  { id: "B03", length: 280, cranes: ["QC06"] },
];

const EVENT_PAYLOADS: Record<Exclude<ScenarioId, "baseline">, DisruptionPayload> = {
  eta_delay: {
    scenario: "ETA Delay",
    events: [
      { time: "2026-08-21T09:30:00", type: "VESSEL_DELAY", vessel_id: "VESSEL_A", old_eta: "2026-08-21T10:00:00", new_eta: "2026-08-21T14:00:00" },
    ],
  },
  crane_failure: {
    scenario: "Crane Failure",
    events: [{ time: "2026-08-21T11:00:00", type: "CRANE_FAILURE", crane_id: "QC02", expected_repair_time: "2026-08-21T20:00:00" }],
  },
  compound_disruption: {
    scenario: "Compound Disruption",
    events: [
      { time: "2026-08-21T09:30:00", type: "VESSEL_DELAY", vessel_id: "VESSEL_A", old_eta: "2026-08-21T10:00:00", new_eta: "2026-08-21T14:00:00" },
      { time: "2026-08-21T11:00:00", type: "CRANE_FAILURE", crane_id: "QC02", expected_repair_time: "2026-08-21T20:00:00" },
    ],
  },
};

export const BASELINE_PLAN: RecoveryPlan = {
  plan_id: "PLAN_MIN_WAIT",
  description: "Minimise average vessel waiting time.",
  schedule: [
    { berth_id: "B02", vessel_id: "VESSEL_A", start_time: "2026-08-21T10:00:00", end_time: "2026-08-22T16:00:00", cranes_used: 2 },
    { berth_id: "B03", vessel_id: "VESSEL_B", start_time: "2026-08-21T13:00:00", end_time: "2026-08-22T19:00:00", cranes_used: 1 },
    { berth_id: "B01", vessel_id: "VESSEL_D", start_time: "2026-08-21T15:00:00", end_time: "2026-08-21T21:45:00", cranes_used: 3 },
    { berth_id: "B01", vessel_id: "VESSEL_C", start_time: "2026-08-21T21:45:00", end_time: "2026-08-22T11:15:00", cranes_used: 3 },
  ],
};
export const BASELINE_KPIS: PlanKpis = { avg_waiting_hours: 1.94, berth_utilization: 81.06, crane_idle_pct: 23.86 };

const PLANS: Record<Exclude<ScenarioId, "baseline">, { plans: RecoveryPlan[]; metrics: Record<string, PlanKpis> }> = {
  eta_delay: {
    plans: [
      {
        plan_id: "PLAN_MIN_WAIT",
        description: "Minimise average vessel waiting time.",
        schedule: [
          { berth_id: "B03", vessel_id: "VESSEL_B", start_time: "2026-08-21T13:00:00", end_time: "2026-08-22T19:00:00", cranes_used: 1 },
          { berth_id: "B02", vessel_id: "VESSEL_A", start_time: "2026-08-21T14:00:00", end_time: "2026-08-22T20:00:00", cranes_used: 2 },
          { berth_id: "B01", vessel_id: "VESSEL_D", start_time: "2026-08-21T15:00:00", end_time: "2026-08-21T21:45:00", cranes_used: 3 },
          { berth_id: "B01", vessel_id: "VESSEL_C", start_time: "2026-08-21T21:45:00", end_time: "2026-08-22T11:15:00", cranes_used: 3 },
        ],
      },
      {
        plan_id: "PLAN_THROUGHPUT",
        description: "Minimise total schedule completion time.",
        schedule: [
          { berth_id: "B03", vessel_id: "VESSEL_B", start_time: "2026-08-21T13:00:00", end_time: "2026-08-22T19:00:00", cranes_used: 1 },
          { berth_id: "B02", vessel_id: "VESSEL_C", start_time: "2026-08-21T14:00:00", end_time: "2026-08-22T10:00:00", cranes_used: 2 },
          { berth_id: "B01", vessel_id: "VESSEL_D", start_time: "2026-08-21T15:00:00", end_time: "2026-08-21T21:45:00", cranes_used: 3 },
          { berth_id: "B01", vessel_id: "VESSEL_A", start_time: "2026-08-21T21:45:00", end_time: "2026-08-22T17:45:00", cranes_used: 3 },
        ],
      },
    ],
    metrics: {
      PLAN_MIN_WAIT: { avg_waiting_hours: 1.94, berth_utilization: 86.29, crane_idle_pct: 18.95 },
      PLAN_THROUGHPUT: { avg_waiting_hours: 1.94, berth_utilization: 85.28, crane_idle_pct: 16.53 },
    },
  },
  crane_failure: {
    plans: [
      {
        plan_id: "PLAN_MIN_WAIT",
        description: "Minimise average vessel waiting time.",
        schedule: [
          { berth_id: "B02", vessel_id: "VESSEL_A", start_time: "2026-08-21T10:00:00", end_time: "2026-08-22T16:00:00", cranes_used: 2 },
          { berth_id: "B03", vessel_id: "VESSEL_B", start_time: "2026-08-21T13:00:00", end_time: "2026-08-22T19:00:00", cranes_used: 1 },
          { berth_id: "B01", vessel_id: "VESSEL_D", start_time: "2026-08-21T15:00:00", end_time: "2026-08-22T01:00:00", cranes_used: 2 },
          { berth_id: "B01", vessel_id: "VESSEL_C", start_time: "2026-08-22T01:00:00", end_time: "2026-08-22T21:00:00", cranes_used: 2 },
        ],
      },
      {
        plan_id: "PLAN_THROUGHPUT",
        description: "Minimise total schedule completion time.",
        schedule: [
          { berth_id: "B02", vessel_id: "VESSEL_A", start_time: "2026-08-21T10:00:00", end_time: "2026-08-22T16:00:00", cranes_used: 2 },
          { berth_id: "B03", vessel_id: "VESSEL_B", start_time: "2026-08-21T13:00:00", end_time: "2026-08-22T19:00:00", cranes_used: 1 },
          { berth_id: "B01", vessel_id: "VESSEL_C", start_time: "2026-08-21T14:00:00", end_time: "2026-08-22T10:00:00", cranes_used: 2 },
          { berth_id: "B01", vessel_id: "VESSEL_D", start_time: "2026-08-22T10:00:00", end_time: "2026-08-22T20:00:00", cranes_used: 2 },
        ],
      },
    ],
    metrics: {
      PLAN_MIN_WAIT: { avg_waiting_hours: 2.75, berth_utilization: 85.71, crane_idle_pct: 14.29 },
      PLAN_THROUGHPUT: { avg_waiting_hours: 4.75, berth_utilization: 88.24, crane_idle_pct: 11.76 },
    },
  },
  compound_disruption: {
    plans: [
      {
        plan_id: "PLAN_MIN_WAIT",
        description: "Minimise average vessel waiting time.",
        schedule: [
          { berth_id: "B03", vessel_id: "VESSEL_B", start_time: "2026-08-21T13:00:00", end_time: "2026-08-22T19:00:00", cranes_used: 1 },
          { berth_id: "B02", vessel_id: "VESSEL_A", start_time: "2026-08-21T14:00:00", end_time: "2026-08-22T20:00:00", cranes_used: 2 },
          { berth_id: "B01", vessel_id: "VESSEL_D", start_time: "2026-08-21T15:00:00", end_time: "2026-08-22T01:00:00", cranes_used: 2 },
          { berth_id: "B01", vessel_id: "VESSEL_C", start_time: "2026-08-22T01:00:00", end_time: "2026-08-22T21:00:00", cranes_used: 2 },
        ],
      },
      {
        plan_id: "PLAN_THROUGHPUT",
        description: "Minimise total schedule completion time.",
        schedule: [
          { berth_id: "B03", vessel_id: "VESSEL_B", start_time: "2026-08-21T13:00:00", end_time: "2026-08-22T19:00:00", cranes_used: 1 },
          { berth_id: "B01", vessel_id: "VESSEL_C", start_time: "2026-08-21T14:00:00", end_time: "2026-08-22T10:00:00", cranes_used: 2 },
          { berth_id: "B02", vessel_id: "VESSEL_A", start_time: "2026-08-21T14:00:00", end_time: "2026-08-22T20:00:00", cranes_used: 2 },
          { berth_id: "B01", vessel_id: "VESSEL_D", start_time: "2026-08-22T10:00:00", end_time: "2026-08-22T20:00:00", cranes_used: 2 },
        ],
      },
    ],
    metrics: {
      PLAN_MIN_WAIT: { avg_waiting_hours: 2.75, berth_utilization: 93.75, crane_idle_pct: 6.25 },
      PLAN_THROUGHPUT: { avg_waiting_hours: 4.75, berth_utilization: 96.77, crane_idle_pct: 3.23 },
    },
  },
};

const STEP_SUMMARIES: Record<Exclude<ScenarioId, "baseline">, { step: string; summary: string }[]> = {
  eta_delay: [
    { step: "detect_disruption", summary: "VESSEL_A delay logged at 09:30." },
    { step: "assess_impact", summary: "1 berth, 1 downstream vessel affected." },
    { step: "generate_candidates", summary: "2 recovery plans produced." },
    { step: "simulate_candidates", summary: "Checked plans against constraints." },
    { step: "recommend_plan", summary: "Minimize Wait scored best on wait time." },
    { step: "human_approval", summary: "Review the plans on the left." },
    { step: "apply_plan", summary: "Updates the live schedule." },
  ],
  crane_failure: [
    { step: "detect_disruption", summary: "QC02 fault code logged at 11:00." },
    { step: "assess_impact", summary: "Berth B01 down to 2 of 3 cranes." },
    { step: "generate_candidates", summary: "2 recovery plans produced." },
    { step: "simulate_candidates", summary: "Checked plans against constraints." },
    { step: "recommend_plan", summary: "Minimize Wait scored best overall." },
    { step: "human_approval", summary: "Review the plans on the left." },
    { step: "apply_plan", summary: "Updates the live schedule." },
  ],
  compound_disruption: [
    { step: "detect_disruption", summary: "2 events logged: VESSEL_A delay, QC02 failure." },
    { step: "assess_impact", summary: "2 berths, multiple vessels affected." },
    { step: "generate_candidates", summary: "2 recovery plans produced." },
    { step: "simulate_candidates", summary: "Checked plans against constraints." },
    { step: "recommend_plan", summary: "Minimize Wait scored best overall." },
    { step: "human_approval", summary: "Review the plans on the left." },
    { step: "apply_plan", summary: "Updates the live schedule." },
  ],
};

export function buildScenario(id: Exclude<ScenarioId, "baseline">, label: string): ScenarioData {
  const payload = EVENT_PAYLOADS[id];
  const { disruption, craneAlert, delayedHours } = summarizeDisruption(payload.events, BERTHS);
  const { plans, metrics } = PLANS[id];
  const recommendedPlanId = plans[0].plan_id;
  const recommended = plans[0];
  const alternative = plans.find((p) => p.plan_id !== recommendedPlanId) ?? null;

  return {
    id,
    label,
    disruption,
    payload,
    berths: BERTHS,
    problemVessels: deriveVesselPositions(BASELINE_PLAN.schedule, delayedHours),
    resolvedVessels: deriveVesselPositions(recommended.schedule, delayedHours, BASELINE_PLAN.schedule),
    ghostVessels: alternative ? deriveVesselPositions(alternative.schedule, delayedHours, BASELINE_PLAN.schedule) : null,
    craneAlert,
    agentSteps: toDisplaySteps(STEP_SUMMARIES[id]),
    candidatePlans: plans,
    planKpis: metrics,
    recommendedPlanId,
    baselineKpis: BASELINE_KPIS,
    consequenceBeats: consequenceBeats(payload.events, BERTHS),
    actionSentence: describeAction(BASELINE_PLAN.schedule, recommended.schedule, Object.keys(delayedHours)),
  };
}

export const SCENARIOS: Record<ScenarioId, ScenarioData> = {
  baseline: {
    id: "baseline",
    label: "Normal Operations",
    disruption: null,
    payload: null,
    berths: BERTHS,
    problemVessels: deriveVesselPositions(BASELINE_PLAN.schedule, {}),
    resolvedVessels: deriveVesselPositions(BASELINE_PLAN.schedule, {}),
    ghostVessels: null,
    craneAlert: null,
    agentSteps: [],
    candidatePlans: [],
    planKpis: {},
    recommendedPlanId: null,
    baselineKpis: BASELINE_KPIS,
    consequenceBeats: [],
    actionSentence: null,
  },
  eta_delay: buildScenario("eta_delay", "ETA Delay"),
  crane_failure: buildScenario("crane_failure", "Crane Failure"),
  compound_disruption: buildScenario("compound_disruption", "Compound Disruption"),
};

export const SCENARIO_ORDER: ScenarioId[] = ["baseline", "eta_delay", "crane_failure", "compound_disruption"];

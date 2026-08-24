import type { ScenarioData, ScenarioId } from "./types";

// Stand-in for the real scenario files in /scenarios and the backend's
// POST /disruptions + GET /plans responses (see specs.md §7-9). Backend
// tools are still hardcoded mocks too, so these numbers are illustrative,
// not computed. Swap the source of a given scenario for a real fetch once
// the backend returns live data — ScenarioData is the seam.

const BERTHS = [
  { id: "B01", length: 400, cranes: ["QC01", "QC02", "QC03"] },
  { id: "B02", length: 350, cranes: ["QC04", "QC05"] },
];

export const SCENARIOS: Record<ScenarioId, ScenarioData> = {
  baseline: {
    id: "baseline",
    label: "Normal Operations",
    disruption: null,
    berths: BERTHS,
    vessels: [
      { vessel_id: "VESSEL_A", berth_id: "B01", status: "docked" },
      { vessel_id: "VESSEL_B", berth_id: "B02", status: "docked" },
    ],
    craneAlert: null,
    agentSteps: [],
    candidatePlans: [],
    planKpis: {},
    recommendedPlanId: null,
    baselineKpis: { avg_waiting_hours: 1.1, berth_utilization: 74, crane_idle_pct: 11 },
  },

  eta_delay: {
    id: "eta_delay",
    label: "ETA Delay",
    disruption: {
      type: "VESSEL_DELAY",
      headline: "VESSEL_A is running 4h late",
      detail: "New ETA 14:00 at Berth B01, originally 10:00",
      tag: "+4h",
      detected_at: "09:30",
    },
    berths: BERTHS,
    vessels: [
      { vessel_id: "VESSEL_A", berth_id: "B01", status: "delayed", delay_hours: 4 },
      { vessel_id: "VESSEL_B", berth_id: "B02", status: "docked" },
    ],
    craneAlert: null,
    agentSteps: [
      { step: "detect_disruption", summary: "VESSEL_A delay logged at 09:30.", state: "done" },
      { step: "assess_impact", summary: "1 berth, 1 downstream vessel affected.", state: "done" },
      { step: "generate_candidates", summary: "2 recovery plans produced.", state: "done" },
      { step: "simulate_candidates", summary: "Checked plans against constraints.", state: "done" },
      { step: "recommend_plan", summary: "Plan B scored best on wait time.", state: "done" },
      { step: "human_approval", summary: "Review the plans on the left.", state: "active" },
      { step: "apply_plan", summary: "Updates the live schedule.", state: "pending" },
    ],
    candidatePlans: [
      { plan_id: "PLAN_B_SWAP", name: "Plan B — Swap", description: "Swap berth allocation for Vessel A and Vessel B." },
      { plan_id: "PLAN_A_PUSH", name: "Plan A — Push", description: "Push all vessels back by 4 hours." },
    ],
    planKpis: {
      PLAN_B_SWAP: { avg_waiting_hours: 1.2, berth_utilization: 85.5, crane_idle_pct: 14 },
      PLAN_A_PUSH: { avg_waiting_hours: 4.5, berth_utilization: 78, crane_idle_pct: 22 },
    },
    recommendedPlanId: "PLAN_B_SWAP",
    baselineKpis: { avg_waiting_hours: 5.8, berth_utilization: 71, crane_idle_pct: 27 },
  },

  crane_failure: {
    id: "crane_failure",
    label: "Crane Failure",
    disruption: {
      type: "CRANE_FAILURE",
      headline: "QC02 has gone offline at Berth B01",
      detail: "Estimated repair time 3h — 2 of 3 cranes remain in service",
      tag: "1 down",
      detected_at: "11:05",
    },
    berths: BERTHS,
    vessels: [
      { vessel_id: "VESSEL_A", berth_id: "B01", status: "docked" },
      { vessel_id: "VESSEL_B", berth_id: "B02", status: "docked" },
    ],
    craneAlert: { berth_id: "B01", crane_id: "QC02" },
    agentSteps: [
      { step: "detect_disruption", summary: "QC02 fault code logged at 11:05.", state: "done" },
      { step: "assess_impact", summary: "Berth B01 throughput cut by roughly a third.", state: "done" },
      { step: "generate_candidates", summary: "2 recovery plans produced.", state: "done" },
      { step: "simulate_candidates", summary: "Checked plans against constraints.", state: "done" },
      { step: "recommend_plan", summary: "Reroute scored best on wait time.", state: "done" },
      { step: "human_approval", summary: "Review the plans on the left.", state: "active" },
      { step: "apply_plan", summary: "Updates the live schedule.", state: "pending" },
    ],
    candidatePlans: [
      { plan_id: "PLAN_C_REROUTE", name: "Plan C — Reroute", description: "Reroute Vessel A's remaining moves to QC01 and QC03." },
      { plan_id: "PLAN_D_HOLD", name: "Plan D — Hold", description: "Hold Vessel A at berth until QC02 is repaired." },
    ],
    planKpis: {
      PLAN_C_REROUTE: { avg_waiting_hours: 1.8, berth_utilization: 80, crane_idle_pct: 20 },
      PLAN_D_HOLD: { avg_waiting_hours: 3.9, berth_utilization: 68, crane_idle_pct: 35 },
    },
    recommendedPlanId: "PLAN_C_REROUTE",
    baselineKpis: { avg_waiting_hours: 3.2, berth_utilization: 74, crane_idle_pct: 35 },
  },

  compound_disruption: {
    id: "compound_disruption",
    label: "Compound Disruption",
    disruption: {
      type: "COMPOUND",
      headline: "2 simultaneous events: VESSEL_A delay + QC02 failure",
      detail: "VESSEL_A running 4h late while Berth B01 is down a crane",
      tag: "2 events",
      detected_at: "09:45",
    },
    berths: BERTHS,
    vessels: [
      { vessel_id: "VESSEL_A", berth_id: "B01", status: "delayed", delay_hours: 4 },
      { vessel_id: "VESSEL_B", berth_id: "B02", status: "docked" },
      { vessel_id: "VESSEL_C", berth_id: null, status: "queued" },
    ],
    craneAlert: { berth_id: "B01", crane_id: "QC02" },
    agentSteps: [
      { step: "detect_disruption", summary: "2 events logged: VESSEL_A delay, QC02 failure.", state: "done" },
      { step: "assess_impact", summary: "2 berths, 2 downstream vessels affected.", state: "done" },
      { step: "generate_candidates", summary: "2 recovery plans produced.", state: "done" },
      { step: "simulate_candidates", summary: "Checked plans against constraints.", state: "done" },
      { step: "recommend_plan", summary: "Full re-optimize scored best overall.", state: "done" },
      { step: "human_approval", summary: "Review the plans on the left.", state: "active" },
      { step: "apply_plan", summary: "Updates the live schedule.", state: "pending" },
    ],
    candidatePlans: [
      { plan_id: "PLAN_E_REOPT", name: "Plan E — Re-optimize", description: "Swap B01/B02 assignments and reroute cranes terminal-wide." },
      { plan_id: "PLAN_F_PARTIAL", name: "Plan F — Partial", description: "Push Vessel A back only; leave crane assignments unchanged." },
    ],
    planKpis: {
      PLAN_E_REOPT: { avg_waiting_hours: 2.6, berth_utilization: 88, crane_idle_pct: 16 },
      PLAN_F_PARTIAL: { avg_waiting_hours: 5.1, berth_utilization: 73, crane_idle_pct: 30 },
    },
    recommendedPlanId: "PLAN_E_REOPT",
    baselineKpis: { avg_waiting_hours: 7.4, berth_utilization: 62, crane_idle_pct: 38 },
  },
};

export const SCENARIO_ORDER: ScenarioId[] = ["baseline", "eta_delay", "crane_failure", "compound_disruption"];

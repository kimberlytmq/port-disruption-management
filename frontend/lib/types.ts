// Shapes mirror the API contract in specs.md (§7-9), simplified for the
// frontend's own presentation needs (e.g. Disruption carries a precomputed
// headline/tag instead of raw fields, since it must cover several event
// types). Swapping mock scenarios for real API data later means adapting
// the backend response into this shape in lib/data.ts, not rewriting the UI.

export type ScenarioId = "baseline" | "eta_delay" | "crane_failure" | "compound_disruption";

export type AgentStepState = "done" | "active" | "pending";

export interface AgentStep {
  step: string;
  summary: string;
  state: AgentStepState;
}

export interface PlanKpis {
  avg_waiting_hours: number;
  berth_utilization: number;
  crane_idle_pct: number;
}

export interface RecoveryPlan {
  plan_id: string;
  name: string;
  description: string;
}

export interface Berth {
  id: string;
  length: number;
  cranes: string[];
}

export type VesselStatus = "docked" | "delayed" | "queued";

export interface VesselPosition {
  vessel_id: string;
  // null when the vessel is queued/offshore and not yet assigned a berth.
  berth_id: string | null;
  status: VesselStatus;
  delay_hours?: number;
}

export interface CraneAlert {
  berth_id: string;
  crane_id: string;
}

export type DisruptionType = "VESSEL_DELAY" | "CRANE_FAILURE" | "YARD_CONGESTION" | "COMPOUND";

export interface Disruption {
  type: DisruptionType;
  headline: string;
  detail: string;
  tag: string;
  detected_at: string;
}

export interface ScenarioData {
  id: ScenarioId;
  label: string;
  disruption: Disruption | null;
  berths: Berth[];
  vessels: VesselPosition[];
  craneAlert: CraneAlert | null;
  agentSteps: AgentStep[];
  candidatePlans: RecoveryPlan[];
  planKpis: Record<string, PlanKpis>;
  recommendedPlanId: string | null;
  baselineKpis: PlanKpis;
}

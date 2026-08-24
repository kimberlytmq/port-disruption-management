// Shapes mirror the real API contract in specs.md (§7-9) and the actual
// backend response shapes verified against a running server. Disruption
// carries a precomputed headline/tag (derived once in lib/derive.ts from the
// raw event payload) rather than per-type fields, since one component needs
// to render several event types without a big conditional.

export type ScenarioId = "baseline" | "eta_delay" | "crane_failure" | "compound_disruption";

export type AgentStepState = "done" | "active" | "pending";

export interface RawAgentStep {
  step: string;
  summary: string;
}

export interface AgentStep extends RawAgentStep {
  state: AgentStepState;
}

export interface PlanKpis {
  avg_waiting_hours: number;
  berth_utilization: number;
  crane_idle_pct: number;
}

export interface ScheduleEntry {
  berth_id: string;
  vessel_id: string;
  start_time: string;
  end_time: string;
  cranes_used: number;
}

export interface RecoveryPlan {
  plan_id: string;
  description: string;
  schedule: ScheduleEntry[];
}

export interface Berth {
  id: string;
  length: number;
  cranes: string[];
}

export type VesselStatus = "docked" | "delayed" | "queued";

export interface VesselPosition {
  vessel_id: string;
  berth_id: string;
  status: VesselStatus;
  delay_hours?: number;
  // 0 = the current occupant (docked/delayed), 1+ = waiting in line for the
  // same berth once it frees up.
  queueIndex: number;
}

export interface CraneAlert {
  berth_id: string;
  crane_id: string;
}

export type DisruptionEventType = "VESSEL_DELAY" | "CRANE_FAILURE" | "YARD_CONGESTION";

// Matches backend/app/main.py's DisruptionEventDetail exactly — every field
// optional except type, since which fields apply depends on the event type.
export interface DisruptionEvent {
  type: DisruptionEventType;
  vessel_id?: string;
  crane_id?: string;
  time?: string;
  old_eta?: string;
  new_eta?: string;
  expected_repair_time?: string;
  delay_hours?: number;
}

export interface DisruptionPayload {
  scenario: string;
  events: DisruptionEvent[];
}

export interface Disruption {
  type: DisruptionEventType | "COMPOUND";
  headline: string;
  detail: string;
  tag: string;
  detected_at: string;
}

export interface ScenarioData {
  id: ScenarioId;
  label: string;
  disruption: Disruption | null;
  payload: DisruptionPayload | null;
  berths: Berth[];
  vessels: VesselPosition[];
  craneAlert: CraneAlert | null;
  agentSteps: AgentStep[];
  candidatePlans: RecoveryPlan[];
  planKpis: Record<string, PlanKpis>;
  recommendedPlanId: string | null;
  baselineKpis: PlanKpis;
}

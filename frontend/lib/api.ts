import type { DisruptionPayload, PlanKpis, RawAgentStep, RecoveryPlan, ScenarioData, ScenarioId, ScheduleEntry } from "./types";
import { consequenceBeats, deriveVesselPositions, describeAction, summarizeDisruption, toDisplaySteps } from "./derive";
import { BASELINE_PLAN, SCENARIOS } from "./scenarios";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

interface DisruptionsResponse {
  status: string;
  disruption_summary: string | null;
  recommended_plan: RecoveryPlan | null;
  agent_steps: RawAgentStep[];
}

interface PlansResponse {
  candidate_plans: RecoveryPlan[];
  plan_kpis?: Record<string, PlanKpis>;
  recommended_plan: RecoveryPlan | null;
}

interface TerminalStateResponse {
  berths: unknown[];
  vessels: unknown[];
  schedule?: ScheduleEntry[];
}

interface ApproveResponse {
  status: string;
  plan_id: string;
  message: string;
  agent_steps: RawAgentStep[];
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return res.json();
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`);
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return res.json();
}

export function approvePlan(planId: string, approved: boolean) {
  return postJson<ApproveResponse>(`/approve`, { plan_id: planId, approved });
}

export async function getAppliedSchedule(): Promise<ScheduleEntry[] | null> {
  try {
    const state = await getJson<TerminalStateResponse>("/terminal-state");
    return state.schedule && state.schedule.length > 0 ? state.schedule : null;
  } catch {
    return null;
  }
}

async function runLive(id: Exclude<ScenarioId, "baseline">, payload: DisruptionPayload): Promise<ScenarioData> {
  const berths = SCENARIOS[id].berths;
  const { disruption, craneAlert, delayedHours } = summarizeDisruption(payload.events, berths);

  const disruptionsResult = await postJson<DisruptionsResponse>("/disruptions", payload);
  const plansResult = await getJson<PlansResponse>("/plans");

  const candidatePlans = plansResult.candidate_plans.length > 0 ? plansResult.candidate_plans : disruptionsResult.recommended_plan ? [disruptionsResult.recommended_plan] : [];
  const recommended = plansResult.recommended_plan ?? disruptionsResult.recommended_plan;
  if (!recommended) throw new Error("Backend returned no recommended plan");
  const alternative = candidatePlans.find((p) => p.plan_id !== recommended.plan_id) ?? null;

  return {
    id,
    label: SCENARIOS[id].label,
    disruption,
    payload,
    berths,
    problemVessels: deriveVesselPositions(BASELINE_PLAN.schedule, delayedHours),
    resolvedVessels: deriveVesselPositions(recommended.schedule, delayedHours, BASELINE_PLAN.schedule),
    ghostVessels: alternative ? deriveVesselPositions(alternative.schedule, delayedHours, BASELINE_PLAN.schedule) : null,
    craneAlert,
    agentSteps: toDisplaySteps(disruptionsResult.agent_steps),
    candidatePlans,
    planKpis: plansResult.plan_kpis ?? {},
    recommendedPlanId: recommended.plan_id,
    baselineKpis: SCENARIOS[id].baselineKpis,
    consequenceBeats: consequenceBeats(payload.events, berths),
    actionSentence: describeAction(BASELINE_PLAN.schedule, recommended.schedule, Object.keys(delayedHours)),
  };
}

export async function loadScenario(id: ScenarioId): Promise<{ data: ScenarioData; source: "live" | "fallback" }> {
  if (id === "baseline") {
    return { data: SCENARIOS.baseline, source: "fallback" };
  }
  const payload = SCENARIOS[id].payload;
  if (!payload) return { data: SCENARIOS[id], source: "fallback" };

  try {
    const data = await runLive(id, payload);
    return { data, source: "live" };
  } catch {
    return { data: SCENARIOS[id], source: "fallback" };
  }
}
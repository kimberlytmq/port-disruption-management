import type { DisruptionPayload, PlanKpis, RawAgentStep, RecoveryPlan, ScenarioData, ScenarioId } from "./types";
import { deriveVesselPositions, summarizeDisruption, toDisplaySteps } from "./derive";
import { SCENARIOS } from "./scenarios";

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
  return postJson(`/approve`, { plan_id: planId, approved });
}

// Runs a scenario against the real backend (POST /disruptions, then
// GET /plans for KPIs) and reshapes the response into a ScenarioData, using
// the exact same derive.ts helpers the precomputed fallback uses — so the
// rest of the UI can't tell live and fallback data apart.
async function runLive(id: Exclude<ScenarioId, "baseline">, payload: DisruptionPayload): Promise<ScenarioData> {
  const berths = SCENARIOS[id].berths;
  const { disruption, craneAlert, delayedHours } = summarizeDisruption(payload.events, berths);

  const disruptionsResult = await postJson<DisruptionsResponse>("/disruptions", payload);
  const plansResult = await getJson<PlansResponse>("/plans");

  const candidatePlans = plansResult.candidate_plans.length > 0 ? plansResult.candidate_plans : disruptionsResult.recommended_plan ? [disruptionsResult.recommended_plan] : [];
  const recommended = plansResult.recommended_plan ?? disruptionsResult.recommended_plan;
  if (!recommended) throw new Error("Backend returned no recommended plan");

  return {
    id,
    label: SCENARIOS[id].label,
    disruption,
    payload,
    berths,
    vessels: deriveVesselPositions(recommended.schedule, delayedHours),
    craneAlert,
    agentSteps: toDisplaySteps(disruptionsResult.agent_steps),
    candidatePlans,
    planKpis: plansResult.plan_kpis ?? {},
    recommendedPlanId: recommended.plan_id,
    baselineKpis: SCENARIOS[id].baselineKpis,
  };
}

// Tries the live backend first; falls back to the precomputed real-optimizer
// data in lib/scenarios.ts (see its header comment) if the backend is
// unreachable or errors (e.g. GROQ_API_KEY not configured locally). Returns
// which source was used so the UI can say so.
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

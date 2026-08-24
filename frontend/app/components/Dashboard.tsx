"use client";

import { useState } from "react";
import type { ScenarioData, ScenarioId } from "@/lib/types";
import { SCENARIOS } from "@/lib/scenarios";
import { loadScenario } from "@/lib/api";
import { ScenarioPicker } from "./ScenarioPicker";
import { DisruptionAlert } from "./DisruptionAlert";
import { TerminalMap } from "./TerminalMap";
import { RecoveryPlans } from "./RecoveryPlans";
import { ActivityFeed } from "./ActivityFeed";
import { TerminalHealth } from "./TerminalHealth";
import styles from "../page.module.css";

export function Dashboard() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("baseline");
  const [scenario, setScenario] = useState<ScenarioData>(SCENARIOS.baseline);
  const [runId, setRunId] = useState(0);
  const [source, setSource] = useState<"live" | "fallback">("fallback");
  const [loading, setLoading] = useState(false);

  async function play(id: ScenarioId) {
    setScenarioId(id);
    setLoading(true);
    const result = await loadScenario(id);
    setScenario(result.data);
    setSource(result.source);
    setRunId((r) => r + 1);
    setLoading(false);
  }

  const hasPlan = scenario.candidatePlans.length > 0 && scenario.recommendedPlanId !== null;

  return (
    <>
      <ScenarioPicker activeId={scenarioId} onPlay={play} loading={loading} />

      {scenarioId !== "baseline" && (
        <div className={styles.sourceNote}>
          {loading ? "Running the agent pipeline…" : source === "live" ? "● Live result from the backend" : "○ Backend unreachable — showing precomputed results from the real optimizer"}
        </div>
      )}

      <DisruptionAlert disruption={scenario.disruption} />

      <TerminalMap berths={scenario.berths} vessels={scenario.vessels} craneAlert={scenario.craneAlert} />

      <div className={styles.grid}>
        <div>
          <div className={styles.sectionLabel}>{hasPlan ? "Recommended action" : "Terminal status"}</div>
          {hasPlan ? (
            <RecoveryPlans
              key={`plans-${runId}`}
              candidatePlans={scenario.candidatePlans}
              planKpis={scenario.planKpis}
              recommendedPlanId={scenario.recommendedPlanId as string}
              baselineKpis={scenario.baselineKpis}
              live={source === "live"}
            />
          ) : (
            <TerminalHealth key={`health-${runId}`} kpis={scenario.baselineKpis} />
          )}
        </div>

        <div>
          <div className={styles.sectionLabel}>Agent activity</div>
          <ActivityFeed key={`feed-${runId}`} steps={scenario.agentSteps} />
        </div>
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import type { ScenarioId } from "@/lib/types";
import { SCENARIOS } from "@/lib/scenarios";
import { ScenarioPicker } from "./ScenarioPicker";
import { DisruptionAlert } from "./DisruptionAlert";
import { TerminalMap } from "./TerminalMap";
import { RecoveryPlans } from "./RecoveryPlans";
import { ActivityFeed } from "./ActivityFeed";
import { TerminalHealth } from "./TerminalHealth";
import styles from "../page.module.css";

export function Dashboard() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("baseline");
  const [runId, setRunId] = useState(0);
  const scenario = SCENARIOS[scenarioId];

  function play(id: ScenarioId) {
    setScenarioId(id);
    setRunId((r) => r + 1);
  }

  const hasPlan = scenario.candidatePlans.length > 0 && scenario.recommendedPlanId !== null;

  return (
    <>
      <ScenarioPicker activeId={scenarioId} onPlay={play} />

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

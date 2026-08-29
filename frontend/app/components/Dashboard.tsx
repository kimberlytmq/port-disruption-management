"use client";

import { useEffect, useRef, useState } from "react";
import type { ScenarioData, ScenarioId } from "@/lib/types";
import { SCENARIOS, BASELINE_PLAN } from "@/lib/scenarios";
import { loadScenario, getAppliedSchedule } from "@/lib/api";
import { diffVessels, deriveVesselPositions, summarizeDisruption, toDisplaySteps } from "@/lib/derive";
import type { AgentStep, RawAgentStep, VesselPosition } from "@/lib/types";
import { ScenarioTrigger } from "./ScenarioTrigger";
import { ImpactNarration } from "./ImpactNarration";
import { DisruptionAlert } from "./DisruptionAlert";
import { TerminalMap } from "./TerminalMap";
import { RecoveryPlans } from "./RecoveryPlans";
import { ActivityFeed } from "./ActivityFeed";
import { TerminalHealth } from "./TerminalHealth";
import styles from "../page.module.css";

type Phase = "idle" | "loading" | "impact" | "considering" | "settled" | "result";

const BEAT_MS = 1600;
const CONSIDERING_MS = 1800;
const SETTLE_TO_RESULT_MS = 1400;

export function Dashboard() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("baseline");
  const [scenario, setScenario] = useState<ScenarioData>(SCENARIOS.baseline);
  const [source, setSource] = useState<"live" | "fallback">("fallback");
  const [phase, setPhase] = useState<Phase>("idle");
  const [runId, setRunId] = useState(0);
  const [appliedVessels, setAppliedVessels] = useState<VesselPosition[] | null>(null);
  const [freshAgentSteps, setFreshAgentSteps] = useState<RawAgentStep[] | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  useEffect(() => () => clearTimers(), []);

  async function play(id: ScenarioId) {
    clearTimers();
    setScenarioId(id);
    setPhase("loading");
    setAppliedVessels(null);
    setFreshAgentSteps(null);

    const result = await loadScenario(id);
    setScenario(result.data);
    setSource(result.source);
    setRunId((r) => r + 1);
    setPhase("impact");

    const impactMs = Math.max(result.data.consequenceBeats.length, 1) * BEAT_MS;
    timers.current.push(setTimeout(() => setPhase("considering"), impactMs));
    timers.current.push(setTimeout(() => setPhase("settled"), impactMs + CONSIDERING_MS));
    timers.current.push(setTimeout(() => setPhase("result"), impactMs + CONSIDERING_MS + SETTLE_TO_RESULT_MS));
  }

  function reset() {
    clearTimers();
    setScenarioId("baseline");
    setScenario(SCENARIOS.baseline);
    setPhase("idle");
    setAppliedVessels(null);
    setFreshAgentSteps(null);
  }

  async function handleDecided(approved: boolean, freshSteps?: RawAgentStep[]) {
    if (freshSteps) setFreshAgentSteps(freshSteps);
    if (source !== "live" || !scenario.payload) return;
    const schedule = await getAppliedSchedule();
    if (!schedule) {
      setAppliedVessels(scenario.problemVessels);
      return;
    }
    const { delayedHours } = summarizeDisruption(scenario.payload.events, scenario.berths);
    setAppliedVessels(deriveVesselPositions(schedule, delayedHours, BASELINE_PLAN.schedule));
  }

  const isBaseline = scenarioId === "baseline";
  const isResolved = phase === "settled" || phase === "result";
  const mapVessels = appliedVessels ?? (isResolved ? scenario.resolvedVessels : scenario.problemVessels);
  const displaySteps: AgentStep[] = freshAgentSteps ? toDisplaySteps(freshAgentSteps) : scenario.agentSteps;
  const ghostDiff = scenario.ghostVessels ? diffVessels(scenario.ghostVessels, scenario.problemVessels) : [];
  const showGhost = phase === "considering" && ghostDiff.length > 0 ? ghostDiff : null;
  const hasPlan = phase === "result" && scenario.candidatePlans.length > 0 && scenario.recommendedPlanId !== null;

  return (
    <>
      {isBaseline ? (
        <ScenarioTrigger onPlay={play} />
      ) : (
        <div className={styles.sourceNote}>
          <span>
            {phase === "loading"
              ? "Running the agent pipeline…"
              : source === "live"
                ? "● Live result from the backend"
                : "○ Backend unreachable — showing precomputed results from the real optimizer"}
          </span>
          <button className={styles.backLink} onClick={reset}>
            ◂ Back to normal operations
          </button>
        </div>
      )}

      {phase === "loading" ? (
        <div className={styles.hero}>
          <div className={styles.headlinePulse}>Detecting disruption…</div>
        </div>
      ) : (
        <DisruptionAlert disruption={scenario.disruption} />
      )}

      {!isBaseline && phase !== "loading" && <ImpactNarration key={`impact-${runId}`} beats={scenario.consequenceBeats} />}

      <TerminalMap
        berths={scenario.berths}
        vessels={mapVessels}
        craneAlert={scenario.craneAlert}
        ghostVessels={showGhost}
        applied={appliedVessels !== null}
      />

      <div className={styles.grid}>
        <div>
          <div className={styles.sectionLabel}>{hasPlan ? "Recommended action" : isBaseline ? "Terminal status" : "Working"}</div>
          {hasPlan ? (
            <RecoveryPlans
              key={`plans-${runId}`}
              candidatePlans={scenario.candidatePlans}
              planKpis={scenario.planKpis}
              recommendedPlanId={scenario.recommendedPlanId as string}
              baselineKpis={scenario.baselineKpis}
              actionSentence={scenario.actionSentence}
              live={source === "live"}
              onDecided={handleDecided}
            />
          ) : isBaseline ? (
            <TerminalHealth kpis={scenario.baselineKpis} />
          ) : (
            <div className={styles.thinking}>Working through the options…</div>
          )}
        </div>

        <div>
          <div className={styles.sectionLabel}>Agent activity</div>
          {isBaseline ? (
            <div className={styles.thinking}>No active disruptions — agent is idle, watching for events.</div>
          ) : phase === "loading" || phase === "impact" ? (
            <div className={styles.thinking}>Explaining the disruption first…</div>
          ) : (
            <ActivityFeed key={`feed-${runId}`} steps={displaySteps} />
          )}
        </div>
      </div>
    </>
  );
}

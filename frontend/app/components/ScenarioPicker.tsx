"use client";

import type { ScenarioId } from "@/lib/types";
import { SCENARIOS, SCENARIO_ORDER } from "@/lib/scenarios";
import styles from "./ScenarioPicker.module.css";

export function ScenarioPicker({
  activeId,
  onPlay,
}: {
  activeId: ScenarioId;
  onPlay: (id: ScenarioId) => void;
}) {
  return (
    <div className={styles.picker} role="tablist" aria-label="Scenario">
      {SCENARIO_ORDER.map((id) => (
        <button
          key={id}
          role="tab"
          aria-selected={id === activeId}
          className={`${styles.btn} ${id === activeId ? styles.btnActive : ""}`}
          onClick={() => onPlay(id)}
        >
          {SCENARIOS[id].label}
        </button>
      ))}
    </div>
  );
}

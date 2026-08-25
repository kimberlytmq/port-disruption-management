"use client";

import { useState } from "react";
import type { ScenarioId } from "@/lib/types";
import { SCENARIOS } from "@/lib/scenarios";
import styles from "./ScenarioTrigger.module.css";

const ICONS: Record<Exclude<ScenarioId, "baseline">, "clock" | "bolt" | "combo"> = {
  eta_delay: "clock",
  crane_failure: "bolt",
  compound_disruption: "combo",
};

const TITLES: Record<Exclude<ScenarioId, "baseline">, string> = {
  eta_delay: "Vessel running late",
  crane_failure: "Crane goes offline",
  compound_disruption: "Both at once",
};

function Icon({ kind }: { kind: "clock" | "bolt" | "combo" }) {
  if (kind === "clock") return <span className={`${styles.icon}`}><span className={styles.iconClock} /></span>;
  if (kind === "bolt") return <span className={`${styles.icon}`}><span className={styles.iconBolt} /></span>;
  return (
    <span className={styles.icon}>
      <span className={styles.iconCombo}>
        <span className={styles.iconClock} />
        <span className={styles.iconBolt} />
      </span>
    </span>
  );
}

export function ScenarioTrigger({ onPlay }: { onPlay: (id: ScenarioId) => void }) {
  const [open, setOpen] = useState(false);
  const scenarioIds: Exclude<ScenarioId, "baseline">[] = ["eta_delay", "crane_failure", "compound_disruption"];

  if (!open) {
    return (
      <div className={styles.wrap}>
        <button className={styles.launchBtn} onClick={() => setOpen(true)}>
          <span className={styles.bolt} />
          Trigger a scenario
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.cards}>
        {scenarioIds.map((id, i) => (
          <button
            key={id}
            className={styles.card}
            style={{ animationDelay: `${i * 70}ms` }}
            onClick={() => {
              setOpen(false);
              onPlay(id);
            }}
          >
            <Icon kind={ICONS[id]} />
            <div className={styles.cardTitle}>{TITLES[id]}</div>
            <div className={styles.cardTeaser}>{SCENARIOS[id].consequenceBeats[0]}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

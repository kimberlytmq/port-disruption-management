import type { AgentStep, AgentStepState } from "@/lib/types";
import styles from "./ActivityFeed.module.css";

const STEP_LABELS: Record<string, string> = {
  detect_disruption: "Detected disruption",
  assess_impact: "Assessed impact",
  generate_candidates: "Generated candidates",
  simulate_candidates: "Simulated outcomes",
  evaluate_candidates: "Evaluated candidates",
  recommend_plan: "Recommended a plan",
  human_approval: "Awaiting your approval",
  apply_plan: "Apply plan",
};

const MARK: Record<AgentStepState, { icon: string; className: string }> = {
  done: { icon: "✓", className: styles.markDone },
  active: { icon: "●", className: styles.markActive },
  pending: { icon: "–", className: styles.markPending },
};

export function ActivityFeed({ steps }: { steps: AgentStep[] }) {
  if (steps.length === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.empty}>No active disruptions — agent is idle, watching for events.</div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <ul className={styles.feed}>
        {steps.map((step, i) => {
          const mark = MARK[step.state];
          return (
            <li key={step.step} className={styles.step} style={{ animationDelay: `${i * 160}ms` }}>
              <span className={`${styles.mark} ${mark.className}`}>{mark.icon}</span>
              <div>
                <span className={`${styles.name} ${step.state === "pending" ? styles.namePending : ""}`}>
                  {STEP_LABELS[step.step] ?? step.step}
                </span>
                <div className={styles.body}>{step.summary}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

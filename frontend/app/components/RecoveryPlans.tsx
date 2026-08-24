"use client";

import { useState } from "react";
import type { PlanKpis, RecoveryPlan } from "@/lib/types";
import styles from "./RecoveryPlans.module.css";

function waitDelta(baseline: PlanKpis, plan: PlanKpis): string {
  const pct = Math.round(((baseline.avg_waiting_hours - plan.avg_waiting_hours) / baseline.avg_waiting_hours) * 100);
  return `▼${pct}% vs. no action`;
}

function pointDelta(baseline: number, plan: number): string {
  const diff = Math.round((plan - baseline) * 10) / 10;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff} pt`;
}

export function RecoveryPlans({
  candidatePlans,
  planKpis,
  recommendedPlanId,
  baselineKpis,
}: {
  candidatePlans: RecoveryPlan[];
  planKpis: Record<string, PlanKpis>;
  recommendedPlanId: string;
  baselineKpis: PlanKpis;
}) {
  const [decision, setDecision] = useState<"pending" | "approved" | "rejected">("pending");
  const recommended = candidatePlans.find((p) => p.plan_id === recommendedPlanId);
  const alternatives = candidatePlans.filter((p) => p.plan_id !== recommendedPlanId);

  return (
    <div className={styles.plans}>
      {recommended && (
        <div className={`${styles.plan} ${styles.rec}`}>
          <div className={styles.head}>
            <span className={styles.name}>{recommended.name}</span>
            <span className={styles.badge}>Recommended</span>
          </div>
          <div className={styles.desc}>{recommended.description}</div>
          <div className={styles.kpis}>
            <div>
              <div className={styles.kpiLabel}>Avg. wait</div>
              <div className={styles.kpiValue}>{planKpis[recommended.plan_id].avg_waiting_hours}h</div>
              <div className={styles.kpiDeltaPos}>{waitDelta(baselineKpis, planKpis[recommended.plan_id])}</div>
            </div>
            <div>
              <div className={styles.kpiLabel}>Berth use</div>
              <div className={styles.kpiValue}>{planKpis[recommended.plan_id].berth_utilization}%</div>
              <div className={styles.kpiDeltaPos}>{pointDelta(baselineKpis.berth_utilization, planKpis[recommended.plan_id].berth_utilization)}</div>
            </div>
            <div>
              <div className={styles.kpiLabel}>Crane idle</div>
              <div className={styles.kpiValue}>{planKpis[recommended.plan_id].crane_idle_pct}%</div>
              <div className={styles.kpiDeltaPos}>{pointDelta(baselineKpis.crane_idle_pct, planKpis[recommended.plan_id].crane_idle_pct)}</div>
            </div>
          </div>

          {decision === "pending" ? (
            <div className={styles.actions}>
              <button className={`${styles.btn} ${styles.approve}`} onClick={() => setDecision("approved")}>
                Approve {recommended.name.split(" — ")[0]}
              </button>
              <button className={`${styles.btn} ${styles.reject}`} onClick={() => setDecision("rejected")}>
                Reject
              </button>
            </div>
          ) : (
            <div className={`${styles.decision} ${decision === "approved" ? styles.decisionApproved : styles.decisionRejected}`}>
              {decision === "approved"
                ? `Approved — applying ${recommended.name.split(" — ")[0]} to the live schedule.`
                : "Rejected — duty planner will choose another course of action."}
            </div>
          )}
        </div>
      )}

      {alternatives.map((plan) => (
        <div key={plan.plan_id} className={`${styles.plan} ${styles.alt}`}>
          <div className={styles.head}>
            <span className={styles.name}>{plan.name}</span>
          </div>
          <div className={styles.desc}>{plan.description}</div>
          <div className={styles.kpis}>
            <div>
              <div className={styles.kpiLabel}>Avg. wait</div>
              <div className={styles.kpiValue}>{planKpis[plan.plan_id].avg_waiting_hours}h</div>
            </div>
            <div>
              <div className={styles.kpiLabel}>Berth use</div>
              <div className={styles.kpiValue}>{planKpis[plan.plan_id].berth_utilization}%</div>
            </div>
            <div>
              <div className={styles.kpiLabel}>Crane idle</div>
              <div className={styles.kpiValue}>{planKpis[plan.plan_id].crane_idle_pct}%</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

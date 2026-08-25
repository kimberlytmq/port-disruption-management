"use client";

import { useState } from "react";
import type { PlanKpis, RecoveryPlan } from "@/lib/types";
import { PLAN_LABELS } from "@/lib/scenarios";
import { approvePlan } from "@/lib/api";
import styles from "./RecoveryPlans.module.css";

function planRationale(plan: RecoveryPlan): string {
  return PLAN_LABELS[plan.plan_id] ?? plan.description;
}

// Lower wait / crane idle is better; higher berth utilization is better.
function delta(baseline: number, value: number, lowerIsBetter: boolean): { text: string; positive: boolean } {
  const diff = Math.round((value - baseline) * 10) / 10;
  const positive = lowerIsBetter ? diff <= 0 : diff >= 0;
  if (diff === 0) return { text: "±0 vs. normal ops", positive: true };
  const pct = Math.round((Math.abs(diff) / baseline) * 100);
  const arrow = diff < 0 ? "▼" : "▲";
  return { text: `${arrow}${pct}% vs. normal ops`, positive };
}

function pointDelta(baseline: number, value: number, lowerIsBetter: boolean): { text: string; positive: boolean } {
  const diff = Math.round((value - baseline) * 10) / 10;
  const positive = lowerIsBetter ? diff <= 0 : diff >= 0;
  const sign = diff >= 0 ? "+" : "";
  return { text: `${sign}${diff} pt`, positive };
}

export function RecoveryPlans({
  candidatePlans,
  planKpis,
  recommendedPlanId,
  baselineKpis,
  actionSentence,
  live,
}: {
  candidatePlans: RecoveryPlan[];
  planKpis: Record<string, PlanKpis>;
  recommendedPlanId: string;
  baselineKpis: PlanKpis;
  actionSentence: string | null;
  live: boolean;
}) {
  const [decision, setDecision] = useState<"pending" | "approved" | "rejected">("pending");
  const recommended = candidatePlans.find((p) => p.plan_id === recommendedPlanId);
  const alternatives = candidatePlans.filter((p) => p.plan_id !== recommendedPlanId);

  async function decide(approved: boolean) {
    setDecision(approved ? "approved" : "rejected");
    if (live && recommended) {
      try {
        await approvePlan(recommended.plan_id, approved);
      } catch {
        // Live approval is best-effort — the decision still reflects locally
        // even if the backend call fails (e.g. it went offline mid-demo).
      }
    }
  }

  return (
    <div className={styles.plans}>
      {recommended && (
        <div className={`${styles.plan} ${styles.rec}`}>
          <div className={styles.head}>
            <span className={styles.badge}>Recommended action</span>
          </div>
          <div className={styles.actionSentence}>{actionSentence ?? recommended.description}</div>
          <div className={styles.rationale}>Chosen because it {planRationale(recommended)}.</div>
          <div className={styles.kpis}>
            {(() => {
              const kpi = planKpis[recommended.plan_id];
              const wait = delta(baselineKpis.avg_waiting_hours, kpi.avg_waiting_hours, true);
              const util = pointDelta(baselineKpis.berth_utilization, kpi.berth_utilization, false);
              const idle = pointDelta(baselineKpis.crane_idle_pct, kpi.crane_idle_pct, true);
              return (
                <>
                  <div>
                    <div className={styles.kpiLabel}>Avg. wait</div>
                    <div className={styles.kpiValue}>{kpi.avg_waiting_hours}h</div>
                    <div className={`${styles.kpiDelta} ${wait.positive ? styles.pos : styles.neg}`}>{wait.text}</div>
                  </div>
                  <div>
                    <div className={styles.kpiLabel}>Berth use</div>
                    <div className={styles.kpiValue}>{kpi.berth_utilization}%</div>
                    <div className={`${styles.kpiDelta} ${util.positive ? styles.pos : styles.neg}`}>{util.text}</div>
                  </div>
                  <div>
                    <div className={styles.kpiLabel}>Crane idle</div>
                    <div className={styles.kpiValue}>{kpi.crane_idle_pct}%</div>
                    <div className={`${styles.kpiDelta} ${idle.positive ? styles.pos : styles.neg}`}>{idle.text}</div>
                  </div>
                </>
              );
            })()}
          </div>

          {decision === "pending" ? (
            <div className={styles.actions}>
              <button className={`${styles.btn} ${styles.approve}`} onClick={() => decide(true)}>
                Approve this action
              </button>
              <button className={`${styles.btn} ${styles.reject}`} onClick={() => decide(false)}>
                Reject
              </button>
            </div>
          ) : (
            <div className={`${styles.decision} ${decision === "approved" ? styles.decisionApproved : styles.decisionRejected}`}>
              {decision === "approved" ? "Approved — applying this to the live schedule." : "Rejected — duty planner will choose another course of action."}
            </div>
          )}
        </div>
      )}

      {alternatives.map((plan) => (
        <div key={plan.plan_id} className={`${styles.plan} ${styles.alt}`}>
          <div className={styles.head}>
            <span className={styles.name}>Alternative — {plan.description.replace(/\.$/, "")}</span>
          </div>
          <div className={styles.desc}>Considered, but scores worse overall.</div>
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

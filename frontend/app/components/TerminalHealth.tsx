import type { PlanKpis } from "@/lib/types";
import styles from "./TerminalHealth.module.css";

export function TerminalHealth({ kpis }: { kpis: PlanKpis }) {
  return (
    <div className={styles.card}>
      <div className={styles.title}>Nothing needs your attention</div>
      <div className={styles.sub}>Current terminal performance, no recovery action pending.</div>
      <div className={styles.kpis}>
        <div>
          <div className={styles.kpiLabel}>Avg. wait</div>
          <div className={styles.kpiValue}>{kpis.avg_waiting_hours}h</div>
        </div>
        <div>
          <div className={styles.kpiLabel}>Berth use</div>
          <div className={styles.kpiValue}>{kpis.berth_utilization}%</div>
        </div>
        <div>
          <div className={styles.kpiLabel}>Crane idle</div>
          <div className={styles.kpiValue}>{kpis.crane_idle_pct}%</div>
        </div>
      </div>
    </div>
  );
}

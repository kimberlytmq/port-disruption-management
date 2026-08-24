import type { Disruption } from "@/lib/types";
import styles from "./DisruptionAlert.module.css";

export function DisruptionAlert({ disruption }: { disruption: Disruption | null }) {
  if (!disruption) {
    return (
      <div className={styles.hero}>
        <div>
          <div className={`${styles.tag} ${styles.tagOk}`}>All systems normal</div>
          <h1 className={styles.headline}>Terminal is running on schedule</h1>
          <div className={styles.sub}>No active disruptions — agent is monitoring 2 berths</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.hero}>
      <div>
        <div className={styles.tag}>Disruption detected</div>
        <h1 className={styles.headline}>{disruption.headline}</h1>
        <div className={styles.sub}>{disruption.detail}</div>
      </div>
      <div className={styles.delay}>
        <div className={styles.delayLabel}>Impact</div>
        <div className={styles.delayValue}>{disruption.tag}</div>
      </div>
    </div>
  );
}

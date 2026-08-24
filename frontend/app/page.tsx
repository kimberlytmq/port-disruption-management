import { Dashboard } from "./components/Dashboard";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div className={styles.topbarBrand}>
          <span className={styles.dot} /> Port Ops Command Center
        </div>
        <div className={styles.topbarMeta}>Live demo · pick a scenario to play it out</div>
      </div>

      <Dashboard />
    </div>
  );
}

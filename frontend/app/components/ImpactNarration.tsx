import styles from "./ImpactNarration.module.css";

const BEAT_DELAY_MS = 1600;

export function ImpactNarration({ beats }: { beats: string[] }) {
  if (beats.length === 0) return null;
  return (
    <div className={styles.wrap}>
      {beats.map((beat, i) => (
        <div key={i} className={styles.beat} style={{ animationDelay: `${i * BEAT_DELAY_MS}ms` }}>
          <span className={styles.dot} />
          <span>{beat}</span>
        </div>
      ))}
    </div>
  );
}

import type { Berth, CraneAlert, VesselPosition } from "@/lib/types";
import styles from "./TerminalMap.module.css";

function berthPosition(index: number, count: number): string {
  const margin = 12;
  const span = 100 - margin * 2;
  return `${margin + (span * (index + 0.5)) / count}%`;
}

export function TerminalMap({
  berths,
  vessels,
  craneAlert,
}: {
  berths: Berth[];
  vessels: VesselPosition[];
  craneAlert: CraneAlert | null;
}) {
  const positions = new Map(berths.map((berth, i) => [berth.id, berthPosition(i, berths.length)]));

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <h2>Terminal map</h2>
        <div className={styles.legend}>
          <span><i className={styles.lDelay} />Delayed</span>
          <span><i className={styles.lIdle} />Docked / queued</span>
          <span><i className={styles.lBerth} />Berth</span>
        </div>
      </div>
      <div
        className={styles.map}
        role="img"
        aria-label={`Top-down schematic of the terminal. ${vessels
          .map((v) => `${v.vessel_id} is ${v.status} at ${v.berth_id}${v.status === "queued" ? " (waiting for the berth to free up)" : ""}`)
          .join(". ")}.${craneAlert ? ` ${craneAlert.crane_id} is offline at ${craneAlert.berth_id}.` : ""}`}
      >
        <div className={styles.pier} />

        {berths.map((berth) => (
          <div key={berth.id} className={styles.berthGuide} style={{ left: positions.get(berth.id), height: 90 }} />
        ))}

        {berths.map((berth) => (
          <div key={berth.id} className={styles.berthTag} style={{ left: positions.get(berth.id) }}>
            {berth.id} <small>{berth.length}m · {berth.cranes.length} QC</small>
            {craneAlert?.berth_id === berth.id && (
              <span className={styles.craneAlert}>⚠ {craneAlert.crane_id} down</span>
            )}
          </div>
        ))}

        {vessels.map((vessel) => {
          const left = positions.get(vessel.berth_id);
          const motionClass =
            vessel.status === "docked" ? styles.shipDocked : vessel.status === "queued" ? styles.shipQueued : styles.shipDelayed;
          const label =
            vessel.status === "docked"
              ? "docked"
              : vessel.status === "queued"
                ? `queued for ${vessel.berth_id}`
                : `+${vessel.delay_hours}h`;
          const bottomOffset = vessel.status === "queued" ? 150 + (vessel.queueIndex - 1) * 46 : undefined;

          return (
            <div
              key={vessel.vessel_id}
              className={`${styles.ship} ${motionClass}`}
              style={{ left, bottom: bottomOffset }}
            >
              <div className={`${styles.shipTag} ${vessel.status === "delayed" ? styles.shipTagFlagged : ""}`}>
                {vessel.vessel_id} · {label}
              </div>
              <div className={`${styles.hull} ${vessel.status === "delayed" ? styles.hullFlagged : styles.hullIdle}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

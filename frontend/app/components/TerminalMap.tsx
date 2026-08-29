import type { Berth, CraneAlert, VesselPosition } from "@/lib/types";
import styles from "./TerminalMap.module.css";

function berthPosition(index: number, count: number): string {
  const margin = 12;
  const span = 100 - margin * 2;
  return `${margin + (span * (index + 0.5)) / count}%`;
}

function vesselLabel(vessel: VesselPosition): string {
  if (vessel.status === "delayed") {
    return `+${vessel.delay_hours}h`;
  }
  if (vessel.shift_label) {
    return vessel.start_label ? `${vessel.shift_label} · ${vessel.start_label}` : vessel.shift_label;
  }
  if (vessel.status === "queued") {
    return vessel.start_label ? `queued · ${vessel.start_label}` : `queued for ${vessel.berth_id}`;
  }
  return vessel.start_label ? `docked · ${vessel.start_label}` : "docked";
}

export function TerminalMap({
  berths,
  vessels,
  craneAlert,
  ghostVessels,
  applied = false,
}: {
  berths: Berth[];
  vessels: VesselPosition[];
  craneAlert: CraneAlert | null;
  ghostVessels?: VesselPosition[] | null;
  applied?: boolean;
}) {
  const positions = new Map(berths.map((berth, i) => [berth.id, berthPosition(i, berths.length)]));
  const hasShift = vessels.some((v) => v.shift_label);

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <h2>Terminal map</h2>
        <div className={styles.legend}>
          <span><i className={styles.lDelay} />Delayed</span>
          <span><i className={styles.lIdle} />Docked / queued</span>
          {hasShift && (
            <span>
              <i className={applied ? styles.lApplied : styles.lShift} />
              {applied ? "Applied change" : "Plan change"}
            </span>
          )}
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
          const label = vesselLabel(vessel);
          const shifted = Boolean(vessel.shift_label);
          const bottomOffset = vessel.status === "queued" ? 150 + (vessel.queueIndex - 1) * 46 : undefined;
          const tagClass = [
            styles.shipTag,
            vessel.status === "delayed" ? styles.shipTagFlagged : "",
            shifted ? (applied ? styles.shipTagApplied : styles.shipTagShift) : "",
          ]
            .filter(Boolean)
            .join(" ");
          const hullClass = [
            styles.hull,
            vessel.status === "delayed" ? styles.hullFlagged : styles.hullIdle,
            shifted ? (applied ? styles.hullApplied : styles.hullShift) : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={vessel.vessel_id}
              className={`${styles.ship} ${motionClass}`}
              style={{ left, bottom: bottomOffset }}
            >
              <div className={tagClass}>
                {vessel.vessel_id} · {label}
              </div>
              <div className={hullClass} />
            </div>
          );
        })}

        {ghostVessels && <div className={styles.ghostLabel}>Considering an alternative…</div>}
        {(() => {
          const seenPerBerth = new Map<string, number>();
          return (ghostVessels ?? []).map((vessel) => {
            const slot = seenPerBerth.get(vessel.berth_id) ?? 0;
            seenPerBerth.set(vessel.berth_id, slot + 1);
            const offsetPx = slot === 0 ? -58 : 58 * slot;
            const basePct = positions.get(vessel.berth_id);
            return (
              <div
                key={`ghost-${vessel.vessel_id}`}
                className={`${styles.ship} ${styles.ghost}`}
                style={{ left: `calc(${basePct} + ${offsetPx}px)`, bottom: 236 }}
              >
                <div className={styles.ghostTag}>alt: {vessel.vessel_id}</div>
                <div className={`${styles.hull} ${styles.hullGhost}`} />
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

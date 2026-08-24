import type {
  AgentStep,
  AgentStepState,
  Berth,
  CraneAlert,
  Disruption,
  DisruptionEvent,
  RawAgentStep,
  ScheduleEntry,
  VesselPosition,
} from "./types";

const STEP_STATE: Record<string, AgentStepState> = {
  detect_disruption: "done",
  assess_impact: "done",
  generate_candidates: "done",
  simulate_candidates: "done",
  evaluate_candidates: "done",
  recommend_plan: "done",
  human_approval: "active",
  apply_plan: "pending",
};

// The real backend graph (specs.md §4) runs synchronously to completion in
// one request — human_approval doesn't actually block, so by the time a
// response comes back every step already ran. We still want the UI to wait
// for a real click, so human_approval/apply_plan are always shown as
// active/pending here regardless of what the backend already logged.
export function toDisplaySteps(rawSteps: RawAgentStep[]): AgentStep[] {
  return rawSteps.map((s) => ({ ...s, state: STEP_STATE[s.step] ?? "done" }));
}

function hoursBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round((ms / 3_600_000) * 10) / 10;
}

function timeOf(iso: string | undefined): string {
  return iso ? iso.slice(11, 16) : "--:--";
}

export function findBerthForCrane(berths: Berth[], craneId: string): Berth | undefined {
  return berths.find((b) => b.cranes.includes(craneId));
}

// Groups a plan's schedule by berth and turns it into map positions: the
// earliest-starting vessel on a berth is the current occupant (docked, or
// delayed if it's the disrupted vessel); anyone scheduled after it on the
// same berth is queued, waiting for that berth to free up.
export function deriveVesselPositions(schedule: ScheduleEntry[], delayedHours: Record<string, number>): VesselPosition[] {
  const byBerth = new Map<string, ScheduleEntry[]>();
  for (const entry of schedule) {
    const list = byBerth.get(entry.berth_id) ?? [];
    list.push(entry);
    byBerth.set(entry.berth_id, list);
  }

  const positions: VesselPosition[] = [];
  for (const entries of byBerth.values()) {
    const sorted = [...entries].sort((a, b) => a.start_time.localeCompare(b.start_time));
    sorted.forEach((entry, i) => {
      const delay = delayedHours[entry.vessel_id];
      positions.push({
        vessel_id: entry.vessel_id,
        berth_id: entry.berth_id,
        status: i === 0 ? (delay ? "delayed" : "docked") : "queued",
        delay_hours: delay,
        queueIndex: i,
      });
    });
  }
  return positions.sort((a, b) => a.vessel_id.localeCompare(b.vessel_id));
}

// Turns the raw event payload sent to POST /disruptions into display copy +
// a crane alert + a vessel_id -> delay_hours map, so headline text always
// matches the actual event data instead of being hand-written separately.
export function summarizeDisruption(
  events: DisruptionEvent[],
  berths: Berth[],
): { disruption: Disruption | null; craneAlert: CraneAlert | null; delayedHours: Record<string, number> } {
  const delays = events.filter((e) => e.type === "VESSEL_DELAY");
  const craneFailures = events.filter((e) => e.type === "CRANE_FAILURE");

  const delayedHours: Record<string, number> = {};
  for (const e of delays) {
    if (e.vessel_id) {
      delayedHours[e.vessel_id] = e.delay_hours ?? (e.old_eta && e.new_eta ? hoursBetween(e.old_eta, e.new_eta) : 0);
    }
  }

  const firstFailure = craneFailures[0];
  const failureBerth = firstFailure?.crane_id ? findBerthForCrane(berths, firstFailure.crane_id) : undefined;
  const craneAlert: CraneAlert | null =
    firstFailure?.crane_id && failureBerth ? { berth_id: failureBerth.id, crane_id: firstFailure.crane_id } : null;

  if (delays.length > 0 && craneFailures.length > 0) {
    const d = delays[0];
    const c = craneFailures[0];
    return {
      disruption: {
        type: "COMPOUND",
        headline: `2 simultaneous events: ${d.vessel_id} delay + ${c.crane_id} failure`,
        detail: `${d.vessel_id} running ${delayedHours[d.vessel_id ?? ""]}h late while ${craneAlert ? `Berth ${craneAlert.berth_id}` : "a berth"} is down a crane`,
        tag: "2 events",
        detected_at: timeOf(d.time ?? c.time),
      },
      craneAlert,
      delayedHours,
    };
  }

  if (delays.length > 0) {
    const d = delays[0];
    return {
      disruption: {
        type: "VESSEL_DELAY",
        headline: `${d.vessel_id} is running ${delayedHours[d.vessel_id ?? ""]}h late`,
        detail: `New ETA ${timeOf(d.new_eta)}, originally ${timeOf(d.old_eta)}`,
        tag: `+${delayedHours[d.vessel_id ?? ""]}h`,
        detected_at: timeOf(d.time),
      },
      craneAlert: null,
      delayedHours,
    };
  }

  if (craneFailures.length > 0) {
    const c = craneFailures[0];
    const repairHours = c.time && c.expected_repair_time ? hoursBetween(c.time, c.expected_repair_time) : null;
    const fleetNote = failureBerth ? ` — ${failureBerth.cranes.length - 1} of ${failureBerth.cranes.length} cranes remain in service` : "";
    return {
      disruption: {
        type: "CRANE_FAILURE",
        headline: `${c.crane_id} has gone offline${failureBerth ? ` at Berth ${failureBerth.id}` : ""}`,
        detail: `Estimated repair time ${repairHours ?? "?"}h${fleetNote}`,
        tag: "1 down",
        detected_at: timeOf(c.time),
      },
      craneAlert,
      delayedHours: {},
    };
  }

  return { disruption: null, craneAlert: null, delayedHours: {} };
}

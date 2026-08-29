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
};

// human_approval is "active" only while still waiting — i.e. apply_plan has
// not shown up in the raw steps yet. Once it has, both that gate and the
// apply step are "done".
export function toDisplaySteps(rawSteps: RawAgentStep[]): AgentStep[] {
  const decided = rawSteps.some((s) => s.step === "apply_plan");
  return rawSteps.map((s) => {
    if (s.step === "human_approval") {
      return { ...s, state: decided ? "done" : "active" };
    }
    if (s.step === "apply_plan") {
      return { ...s, state: "done" };
    }
    return { ...s, state: STEP_STATE[s.step] ?? "done" };
  });
}

function hoursBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round((ms / 3_600_000) * 10) / 10;
}

function timeOf(iso: string | undefined): string {
  return iso ? iso.slice(11, 16) : "--:--";
}

function formatTimeOnDay(iso: string, referenceDate: string): string {
  const time = timeOf(iso);
  return iso.slice(0, 10) === referenceDate ? time : `${time} next day`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function findBerthForCrane(berths: Berth[], craneId: string): Berth | undefined {
  return berths.find((b) => b.cranes.includes(craneId));
}

// Groups a plan's schedule by berth and turns it into map positions: the
// earliest-starting vessel on a berth is the current occupant (docked, or
// delayed if it's the disrupted vessel); anyone scheduled after it on the
// same berth is queued, waiting for that berth to free up.
//
// Pass `baseline` (normal-ops schedule) to tag vessels whose slot moved —
// that's how the map can show "push back 3h 15m" without a timeline.
export function deriveVesselPositions(
  schedule: ScheduleEntry[],
  delayedHours: Record<string, number>,
  baseline?: ScheduleEntry[],
): VesselPosition[] {
  const byBerth = new Map<string, ScheduleEntry[]>();
  for (const entry of schedule) {
    const list = byBerth.get(entry.berth_id) ?? [];
    list.push(entry);
    byBerth.set(entry.berth_id, list);
  }

  const baselineById = baseline ? new Map(baseline.map((entry) => [entry.vessel_id, entry])) : null;
  const referenceDate = (baseline ?? schedule)[0]?.start_time.slice(0, 10) ?? "";

  const positions: VesselPosition[] = [];
  for (const entries of byBerth.values()) {
    const sorted = [...entries].sort((a, b) => a.start_time.localeCompare(b.start_time));
    sorted.forEach((entry, i) => {
      const delay = delayedHours[entry.vessel_id];
      let shift_label: string | undefined;
      if (baselineById && !delay) {
        const before = baselineById.get(entry.vessel_id);
        if (before) {
          const minutesDelta = Math.round(
            (new Date(entry.start_time).getTime() - new Date(before.start_time).getTime()) / 60_000,
          );
          if (Math.abs(minutesDelta) >= 15) {
            const sign = minutesDelta > 0 ? "+" : "−";
            shift_label = `${sign}${formatDuration(Math.abs(minutesDelta))}`;
          }
        }
      }
      positions.push({
        vessel_id: entry.vessel_id,
        berth_id: entry.berth_id,
        status: i === 0 ? (delay ? "delayed" : "docked") : "queued",
        delay_hours: delay,
        queueIndex: i,
        start_label: entry.start_time ? formatTimeOnDay(entry.start_time, referenceDate) : undefined,
        shift_label,
      });
    });
  }
  return positions.sort((a, b) => a.vessel_id.localeCompare(b.vessel_id));
}

// Only the vessels whose berth or queue slot actually differs between two
// position sets — used to show a "the agent considered this instead" ghost
// without redundantly re-drawing ships that would land in the same spot.
export function diffVessels(a: VesselPosition[], b: VesselPosition[]): VesselPosition[] {
  const byId = new Map(b.map((v) => [v.vessel_id, v]));
  return a.filter((v) => {
    const other = byId.get(v.vessel_id);
    return !other || other.berth_id !== v.berth_id || other.queueIndex !== v.queueIndex;
  });
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

// Plain-English lines explaining why the disruption is a problem, in the
// order they should be revealed. Every number here comes from the real
// event payload — nothing is invented per scenario.
export function consequenceBeats(events: DisruptionEvent[], berths: Berth[]): string[] {
  const delays = events.filter((e) => e.type === "VESSEL_DELAY");
  const craneFailures = events.filter((e) => e.type === "CRANE_FAILURE");
  const beats: string[] = [];

  for (const d of delays) {
    const hrs = d.delay_hours ?? (d.old_eta && d.new_eta ? hoursBetween(d.old_eta, d.new_eta) : 0);
    beats.push(`${d.vessel_id} was due at ${timeOf(d.old_eta)}. It won't arrive until ${timeOf(d.new_eta)} — ${hrs}h late.`);
  }
  for (const c of craneFailures) {
    const berth = c.crane_id ? findBerthForCrane(berths, c.crane_id) : undefined;
    if (berth && c.crane_id) {
      beats.push(
        `${c.crane_id} has gone offline at Berth ${berth.id} — down to ${berth.cranes.length - 1} of ${berth.cranes.length} cranes, so every ship there takes longer to turn around.`,
      );
    }
  }
  if (delays.length > 0 && craneFailures.length > 0) {
    beats.push("Two problems at once — the fix has to account for both, not just patch one.");
  } else if (delays.length > 0) {
    beats.push("That delay lands right on top of the schedule already built for every other vessel.");
  }
  return beats;
}

// The recommendation, phrased as an instruction a duty planner could act on,
// derived from what actually differs between the normal-operations schedule
// and the recommended plan's real schedule — not the optimizer's profile
// name ("Minimise average waiting time"), which describes a goal, not an act.
export function describeAction(baseline: ScheduleEntry[], recommended: ScheduleEntry[], delayedVessels: string[]): string {
  const referenceDate = baseline[0]?.start_time.slice(0, 10) ?? "";
  const byVessel = new Map(baseline.map((e) => [e.vessel_id, e]));

  type Change = { vesselId: string; kind: "berth" | "time"; from?: string; to?: string; berth?: string; minutesDelta: number; newStart: string };
  const changes: Change[] = [];

  for (const entry of recommended) {
    const before = byVessel.get(entry.vessel_id);
    if (!before) continue;
    const minutesDelta = Math.round((new Date(entry.start_time).getTime() - new Date(before.start_time).getTime()) / 60_000);
    if (before.berth_id !== entry.berth_id) {
      changes.push({ vesselId: entry.vessel_id, kind: "berth", from: before.berth_id, to: entry.berth_id, minutesDelta, newStart: entry.start_time });
    } else if (Math.abs(minutesDelta) >= 15 && !delayedVessels.includes(entry.vessel_id)) {
      changes.push({ vesselId: entry.vessel_id, kind: "time", berth: entry.berth_id, minutesDelta, newStart: entry.start_time });
    }
  }

  if (changes.length === 0) {
    const heldVessel = delayedVessels[0];
    const entry = heldVessel ? recommended.find((e) => e.vessel_id === heldVessel) : undefined;
    return entry
      ? `No other vessel needs to move — Berth ${entry.berth_id} simply holds for ${heldVessel} until ${formatTimeOnDay(entry.start_time, referenceDate)}.`
      : "No schedule changes needed — the current plan already holds.";
  }

  changes.sort((a, b) => (a.kind === b.kind ? Math.abs(b.minutesDelta) - Math.abs(a.minutesDelta) : a.kind === "berth" ? -1 : 1));
  const top = changes[0];
  if (top.kind === "berth") {
    return `Move ${top.vesselId} from Berth ${top.from} to Berth ${top.to}.`;
  }
  const verb = top.minutesDelta > 0 ? "Push back" : "Bring forward";
  return `${verb} ${top.vesselId}'s turn at Berth ${top.berth} by ${formatDuration(Math.abs(top.minutesDelta))} to ${formatTimeOnDay(top.newStart, referenceDate)}.`;
}

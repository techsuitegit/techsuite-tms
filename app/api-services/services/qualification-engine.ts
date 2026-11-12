import type {
  GateResult,
  QualificationPolicy,
  RiskBand,
  RunOutResult,
  TankReadingSnapshot,
} from "./qualification-types";

export type EvaluableOrder = {
  id: string;
  isPacked: boolean;
  requestedQty: number;
  requestedQtyUomId: string;
  storageTankId: string | null;
  qualOutcome: string;
  qualMode: string | null;
};

/** Gate 0 predicate — shared by batch SQL and single-order path (D-17 / BE-03). */
export function isInScope(order: Pick<EvaluableOrder, "qualOutcome" | "qualMode">) {
  if (order.qualMode === "MANUAL") return false;
  if (order.qualOutcome === "QUALIFIED" || order.qualOutcome === "REJECTED") return false;
  return (
    order.qualOutcome === "PENDING" ||
    order.qualOutcome === "FLAGGED" ||
    order.qualOutcome === "CANNOT_EVALUATE"
  );
}

/**
 * Pure evaluator — gates 1–3. No I/O.
 * Capacity: ullage = usable × (target − level); compare with ≤ (AC-04).
 */
export function evaluate(
  order: EvaluableOrder,
  snapshot: TankReadingSnapshot | null,
  policy: QualificationPolicy,
  requestedInTankUom: number,
): GateResult {
  const baseInputs = {
    usableCapacity: null as number | null,
    targetFillPct: null as number | null,
    levelPct: null as number | null,
    deadStock: null as number | null,
    readingSource: null as TankReadingSnapshot["readingSource"] | null,
    readingAgeHours: null as number | null,
    requestedQty: order.requestedQty,
  };

  if (order.isPacked || !order.storageTankId) {
    return {
      outcome: "QUALIFIED",
      gateReached: 3,
      failedGate: null,
      reasonCode: "ENG_FITS_ULLAGE",
      reasonText: "Packed cylinders — no tank capacity check applies.",
      ullage: null,
      qualifiedQty: order.requestedQty,
      inputs: baseInputs,
    };
  }

  // GATE 1
  if (!snapshot || snapshot.readingSource === "NONE") {
    return {
      outcome: "CANNOT_EVALUATE",
      gateReached: 1,
      failedGate: 1,
      reasonCode: "ENG_NO_SOURCE",
      reasonText:
        "Telemetry unavailable — no tank reading source configured. Manual dip required before the engine can evaluate capacity.",
      ullage: null,
      qualifiedQty: null,
      inputs: {
        ...baseInputs,
        readingSource: snapshot?.readingSource ?? "NONE",
      },
    };
  }

  const age = snapshot.readingAgeHours;
  // GATE 2 — null age passes (BE-05); strictly greater than threshold (BE-04)
  if (age !== null && age > policy.stalenessThresholdHours) {
    return {
      outcome: "CANNOT_EVALUATE",
      gateReached: 2,
      failedGate: 2,
      reasonCode: "ENG_READING_STALE",
      reasonText:
        `Last reading is ${fmtNum(age)} h old, beyond the ${policy.stalenessThresholdHours} h staleness threshold — refresh required before auto-qualification.`,
      ullage: null,
      qualifiedQty: null,
      inputs: {
        ...baseInputs,
        usableCapacity: snapshot.usableCapacity,
        targetFillPct: snapshot.targetFillPct,
        levelPct: snapshot.levelPct,
        deadStock: snapshot.deadStock,
        readingSource: snapshot.readingSource,
        readingAgeHours: age,
      },
    };
  }

  // GATE 3
  const ullage = round2(snapshot.usableCapacity * (snapshot.targetFillPct - snapshot.levelPct));
  const inputs = {
    usableCapacity: snapshot.usableCapacity,
    targetFillPct: snapshot.targetFillPct,
    levelPct: snapshot.levelPct,
    deadStock: snapshot.deadStock,
    readingSource: snapshot.readingSource,
    readingAgeHours: age,
    requestedQty: order.requestedQty,
  };

  if (requestedInTankUom <= ullage) {
    return {
      outcome: "QUALIFIED",
      gateReached: 3,
      failedGate: null,
      reasonCode: "ENG_FITS_ULLAGE",
      reasonText:
        `Requested ${fmtQty(requestedInTankUom)} fits the ${fmtQty(ullage)} of ullage at ${pct(snapshot.levelPct)} — auto-qualified.`,
      ullage,
      qualifiedQty: order.requestedQty,
      inputs,
    };
  }

  return {
    outcome: "FLAGGED",
    gateReached: 3,
    failedGate: 3,
    reasonCode: "ENG_OVER_ULLAGE",
    reasonText:
      `Requested ${fmtQty(requestedInTankUom)} exceeds the ${fmtQty(ullage)} available at ${pct(snapshot.levelPct)} — flagged for planner review.`,
    ullage,
    qualifiedQty: null,
    inputs,
  };
}

export function runOutDays(
  snapshot: TankReadingSnapshot | null,
  drawRate: number,
): RunOutResult {
  if (!snapshot) return { runOutDays: 99.0, riskBand: "low" };
  const available = Math.max(0, snapshot.levelPct * snapshot.usableCapacity - snapshot.deadStock);
  const daily = snapshot.usableCapacity * drawRate;
  const days = daily <= 0 ? 99.0 : round1(available / daily);
  return { runOutDays: days, riskBand: riskOf(days) };
}

export function riskOf(days: number): RiskBand {
  if (days < 1) return "critical";
  if (days < 2) return "high";
  if (days < 4) return "medium";
  return "low";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function fmtNum(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function fmtQty(n: number) {
  return `${fmtNum(n)} L`;
}

function pct(fraction: number) {
  return `${Math.round(fraction * 100)}%`;
}

export type QualOutcome = "PENDING" | "QUALIFIED" | "FLAGGED" | "CANNOT_EVALUATE" | "REJECTED";
export type ReadingSource = "TEL" | "MANUAL" | "NONE";
export type RiskBand = "critical" | "high" | "medium" | "low";

export type TankReadingSnapshot = {
  tankId: string;
  usableCapacity: number;
  targetFillPct: number;
  levelPct: number;
  deadStock: number;
  readingSource: ReadingSource;
  readingAgeHours: number | null;
  uomId: string;
};

export type QualificationPolicy = {
  id: string;
  code: string;
  name: string;
  stalenessThresholdHours: number;
  ullageFormula: string;
  minEvaluableUllage: number | null;
};

export type GateResult = {
  outcome: "QUALIFIED" | "FLAGGED" | "CANNOT_EVALUATE";
  gateReached: number;
  failedGate: number | null;
  reasonCode: string;
  reasonText: string;
  ullage: number | null;
  qualifiedQty: number | null;
  inputs: {
    usableCapacity: number | null;
    targetFillPct: number | null;
    levelPct: number | null;
    deadStock: number | null;
    readingSource: ReadingSource | null;
    readingAgeHours: number | null;
    requestedQty: number;
  };
};

export type RunOutResult = {
  runOutDays: number;
  riskBand: RiskBand;
};

export type ManualDecisionInput = {
  outcome: "QUALIFIED" | "REJECTED";
  qualifiedQty: number | null;
  reasonCode: string;
  grounds: string;
  reference: string;
  versionNo: number;
};

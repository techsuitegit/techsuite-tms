import type { RiskBand } from "./qualification-types";

export type OrderingStrategy = "ADDITIVE" | "BAND_THEN_SCORE";
export type TieBreak = "RUN_OUT_ASC" | "DUE_DATE_ASC" | "ORDER_NO_ASC";
export type ClassSource = "CLASS" | "SEGMENT_FALLBACK" | "DEFAULT";
export type RankSource = "ENGINE" | "PLANNER";
export type DeliveryMode = "FORECAST" | "MONITOR" | "SCHEDULED" | "WILL_CALL";
export type RankingTrigger = "ON_DEMAND" | "AFTER_QUALIFICATION" | "SCHEDULE" | "API";

export type WeightComponent = {
  componentCode:
    | "RUN_OUT_RISK"
    | "ORDER_VALUE"
    | "DROP_SIZE"
    | "CUSTOMER_CLASS"
    | "WINDOW_PRESSURE";
  weightMax: number;
  sequence: number;
  caption: string;
  decayPerDay: number | null;
  valueDivisor: number | null;
  sizeDivisor: number | null;
  sizeUomCode: string | null;
  modeScores: Record<string, number> | null;
  isEnabled: boolean;
};

export type WeightSet = {
  id: string;
  code: string;
  name: string;
  divisionId: string | null;
  orderingStrategy: OrderingStrategy;
  tieBreak: TieBreak;
  totalWeightCheck: number;
  notes: string | null;
  status: string;
  versionNo: number;
  components: WeightComponent[];
};

export type CustomerClassRow = {
  code: string;
  label: string;
  scoreContribution: number | null;
  definitionSource: string;
};

export type RankingInput = {
  orderId: string;
  orderNo: string;
  dueDate: string;
  mode: DeliveryMode;
  isPacked: boolean;
  runOutDays: number;
  riskBand: RiskBand;
  orderValue: number;
  qualifiedQty: number;
  qtyUomId: string;
  qtyUomCode: string;
  customerClass: string | null;
  customerSegment: string | null;
};

export type ScoreBreakdown = {
  risk: number;
  value: number;
  size: number;
  class: number;
  window: number;
  total: number;
  classSource: ClassSource;
  normalisedQty: number;
  normalisedQtyUomCode: string;
};

export type ScoredOrder = {
  input: RankingInput;
  breakdown: ScoreBreakdown;
  rankPosition: number;
  rankSource: RankSource;
  overrideId: string | null;
  grounds: string | null;
  reference: string | null;
};

export type ReorderInput = {
  orderId: string;
  toPosition: number;
  reasonCode: string;
  grounds: string;
  reference: string;
};

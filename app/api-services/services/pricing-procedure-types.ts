export const CONDITION_VARIABLES = [
  "CUSTOMER_CLASS",
  "CUSTOMER_NAME",
  "KILOMETRES",
  "TRUCK_TYPE",
  "VOLUME",
  "MATERIAL",
] as const;
export const CONDITION_OPERATORS = ["EQ", "NE", "GT", "LT", "NULL"] as const;
export const JOIN_OPS = ["AND", "OR"] as const;
export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;
export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;
export const NUMERIC_VARIABLES = ["KILOMETRES", "VOLUME"] as const;

export type ConditionVariable = (typeof CONDITION_VARIABLES)[number];
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];
export type JoinOp = (typeof JOIN_OPS)[number];
export type ChangeReason = (typeof CHANGE_REASONS)[number];

export type PricingConditionInput = {
  variable: ConditionVariable;
  operator: ConditionOperator;
  value: string | null;
};

export type PricingRuleInput = {
  id?: string;
  code: string;
  priority: number;
  join: JoinOp;
  amount: number;
  conditions: PricingConditionInput[];
};

export type PricingProcedureInput = {
  code: string;
  name: string;
  accessSequence: string;
  active: boolean;
  rules: PricingRuleInput[];
  validFrom: string;
  validTo?: string | null;
  reason: ChangeReason;
  changeNote?: string | null;
  externalId?: string | null;
  versionNo?: number;
};

export type EvaluateFacts = {
  customerClass: string | null;
  customerName: string | null;
  km: number | null;
  truckType: string | null;
  volume: number | null;
  materialId: string | null;
};

export const CREATE_FIELDS = [
  "code",
  "name",
  "accessSequence",
  "active",
  "rules",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

export const EVALUATE_FIELDS = ["customerClass", "customerName", "km", "truckType", "volume", "materialId"] as const;

export const RULE_FIELDS = ["code", "priority", "join", "amount", "conditions"] as const;
export const CONDITION_FIELDS = ["variable", "operator", "value"] as const;

export const UOM_ROUNDINGS = ["HALF_UP", "DOWN", "COMMERCIAL"] as const;
export const UOM_DIMENSIONS = ["VOLUME", "MASS", "COUNT", "TIME"] as const;
export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;
export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export type UomRounding = (typeof UOM_ROUNDINGS)[number];
export type UomDimension = (typeof UOM_DIMENSIONS)[number];
export type ChangeReason = (typeof CHANGE_REASONS)[number];

export type UomInput = {
  code: string;
  name: string;
  isBase: boolean;
  factorToBase: number;
  decimalPlaces: number;
  rounding: UomRounding;
  dimension?: UomDimension | null;
  validFrom: string;
  validTo?: string | null;
  reason: ChangeReason;
  changeNote?: string | null;
  externalId?: string | null;
  versionNo?: number;
};

export const CREATE_FIELDS = [
  "code",
  "name",
  "isBase",
  "factorToBase",
  "decimalPlaces",
  "rounding",
  "dimension",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

export const SAP_UPSERT_FIELDS = CREATE_FIELDS;

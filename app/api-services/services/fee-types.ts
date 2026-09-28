export const CHARGE_TYPES = [
  "FLAT_PER_DELIVERY",
  "PER_VOLUME",
  "PER_STOP",
  "PER_HOUR",
  "PER_CYLINDER",
] as const;
export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;
export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export type ChargeType = (typeof CHARGE_TYPES)[number];
export type ChangeReason = (typeof CHANGE_REASONS)[number];

export type FeeInput = {
  code: string;
  name: string;
  feeType: string;
  chargeType: ChargeType;
  rate: number;
  currency: string;
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
  "feeType",
  "chargeType",
  "rate",
  "currency",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

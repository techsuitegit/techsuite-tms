export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;
export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;

export type ChangeReason = (typeof CHANGE_REASONS)[number];

export type DriverInput = {
  code: string;
  name: string;
  phone: string;
  dlNumber: string;
  dlValidTo: string;
  dlClass?: string | null;
  firstLicensedOn?: string | null;
  hazEndorsed: boolean;
  hazEndorsementRef?: string | null;
  hazEndorsementTo?: string | null;
  homeShippingPointId: string;
  hosRulesetCode?: string | null;
  isActive: boolean;
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
  "phone",
  "dlNumber",
  "dlValidTo",
  "dlClass",
  "firstLicensedOn",
  "hazEndorsed",
  "hazEndorsementRef",
  "hazEndorsementTo",
  "homeShippingPointId",
  "hosRulesetCode",
  "isActive",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

export const SAFETY_FIELDS = [
  "dlNumber",
  "dlValidTo",
  "dlClass",
  "hazEndorsed",
  "hazEndorsementRef",
  "hazEndorsementTo",
] as const;

export type DispatchBlock = {
  code: "DRIVER_DL_EXPIRED" | "DRIVER_DG_ENDORSEMENT_ABSENT" | "DRIVER_DG_ENDORSEMENT_EXPIRED";
  kind: "STATUTORY";
  field: string;
  message: string;
  expiredOn?: string;
};

export const VENDOR_TYPES = ["SUPPLIER", "CARRIER", "DEVICE"] as const;
export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;
export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export type VendorType = (typeof VENDOR_TYPES)[number];
export type MasterStatus = (typeof MASTER_STATUSES)[number];
export type ChangeReason = (typeof CHANGE_REASONS)[number];

export type VendorInput = {
  code: string;
  name: string;
  type: VendorType;
  active: boolean;
  validFrom: string;
  validTo?: string | null;
  reason: ChangeReason;
  changeNote?: string | null;
  externalId: string;
};

export const SAP_UPSERT_FIELDS = [
  "externalId",
  "code",
  "name",
  "type",
  "active",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
] as const;

export const VEHICLE_CLASSES = [
  "BOBTAIL_LPG",
  "BOBTAIL_REFINED",
  "TRANSPORT_TRACTOR",
  "TANK_TRAILER",
  "CYLINDER_TRUCK",
] as const;

export const BELOW_ACTIONS = ["WARN_REASON", "BLOCK_UNLESS_URGENT", "BLOCK"] as const;

export const OVERRIDE_ROLES = ["PLANNER", "KEY_USER", "OPS_MANAGER"] as const;

export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;

export const CREATE_FIELDS = [
  "code",
  "vehicleClass",
  "minLoadPct",
  "belowAction",
  "urgentExempt",
  "overrideRole",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

export type PtlThresholdInput = {
  code: string;
  vehicleClass: (typeof VEHICLE_CLASSES)[number];
  minLoadPct: number;
  belowAction: (typeof BELOW_ACTIONS)[number];
  urgentExempt: boolean;
  overrideRole: (typeof OVERRIDE_ROLES)[number];
  validFrom: string;
  validTo: string | null;
  reason: (typeof CHANGE_REASONS)[number];
  changeNote: string | null;
  externalId: string | null;
  versionNo?: number;
};

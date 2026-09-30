export const CYLINDER_SIZES = ["LB20_KG9", "LB30_KG14", "LB40_KG18", "LB100_KG45"] as const;

export const VALVE_TYPES = ["OPD", "POL", "ACME"] as const;

export const CUSTODY_STATES = ["PLANT", "TRUCK", "CUSTOMER", "IN_TRANSIT", "MAINTENANCE"] as const;

export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;

export const CREATE_FIELDS = [
  "code",
  "serial",
  "rfid",
  "size",
  "materialId",
  "tareKg",
  "fillCapacity",
  "valveType",
  "requalificationDue",
  "custodyState",
  "locationText",
  "shippingPointId",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

export type CylinderInput = {
  code: string;
  serial: string;
  rfid: string | null;
  size: (typeof CYLINDER_SIZES)[number];
  materialId: string;
  tareKg: number;
  fillCapacity: number;
  valveType: (typeof VALVE_TYPES)[number] | null;
  requalificationDue: string;
  custodyState: (typeof CUSTODY_STATES)[number];
  locationText: string | null;
  shippingPointId: string | null;
  validFrom: string;
  validTo: string | null;
  reason: (typeof CHANGE_REASONS)[number];
  changeNote: string | null;
  externalId: string | null;
  versionNo?: number;
};

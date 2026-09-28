export const TANK_OWNERSHIPS = ["OWN", "CUSTOMER", "SUPPLIER"] as const;
export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;
export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export type TankOwnership = (typeof TANK_OWNERSHIPS)[number];
export type ChangeReason = (typeof CHANGE_REASONS)[number];

export type StorageTankInput = {
  code: string;
  name: string;
  ownership: TankOwnership;
  materialId: string;
  legalEntityId?: string | null;
  shippingPointId?: string | null;
  customerCode?: string | null;
  vendorId?: string | null;
  dispatcherPointId?: string | null;
  capacityL: number;
  safeFillL: number;
  safetyStockL?: number | null;
  reorderL?: number | null;
  capacityUomId?: string | null;
  gaugeType?: string | null;
  gaugeDeviceRef?: string | null;
  lastCalibration?: string | null;
  inspectionDue?: string | null;
  certificate?: string | null;
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
  "ownership",
  "materialId",
  "legalEntityId",
  "shippingPointId",
  "customerCode",
  "vendorId",
  "dispatcherPointId",
  "capacityL",
  "safeFillL",
  "safetyStockL",
  "reorderL",
  "capacityUomId",
  "gaugeType",
  "gaugeDeviceRef",
  "lastCalibration",
  "inspectionDue",
  "certificate",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

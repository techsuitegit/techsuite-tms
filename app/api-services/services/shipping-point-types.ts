export const SHIPPING_POINT_TYPES = ["BULK_PLANT", "TERMINAL_RACK", "YARD", "CYLINDER_DEPOT"] as const;
export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;
export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export type ShippingPointType = (typeof SHIPPING_POINT_TYPES)[number];
export type MasterStatus = (typeof MASTER_STATUSES)[number];
export type ChangeReason = (typeof CHANGE_REASONS)[number];

export type ShippingPointInput = {
  code: string;
  name: string;
  divisionId: string;
  type: ShippingPointType;
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM?: number | null;
  openingHours?: string | null;
  loadingBays?: number | null;
  loadingRateLpm?: number | null;
  midShiftReload?: boolean | null;
  productsStocked?: string[] | null;
  leadDispatcher?: string | null;
  phone?: string | null;
  hazmatClass?: string | null;
  permitNo?: string | null;
  permitExpiry?: string | null;
  erpRef?: string | null;
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
  "divisionId",
  "type",
  "address",
  "latitude",
  "longitude",
  "geofenceRadiusM",
  "openingHours",
  "loadingBays",
  "loadingRateLpm",
  "midShiftReload",
  "productsStocked",
  "leadDispatcher",
  "phone",
  "hazmatClass",
  "permitNo",
  "permitExpiry",
  "erpRef",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

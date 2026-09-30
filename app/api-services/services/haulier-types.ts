export const VEHICLE_TYPES = [
  "BOBTAIL_LPG",
  "BOBTAIL_REFINED",
  "TRANSPORT_TRACTOR",
  "TANK_TRAILER",
  "CYLINDER_TRUCK",
] as const;

export const RATE_BASES = ["PER_TRIP", "PER_KM", "PER_TONNE", "PER_HOUR", "PER_LITRE"] as const;

export const SURCHARGE_UNITS = ["PCT", "AMT"] as const;

export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;

export const CREATE_FIELDS = [
  "code",
  "name",
  "registration",
  "dispatchContact",
  "dispatchPhone",
  "email",
  "vehicleTypes",
  "unitsAvailable",
  "zoneIds",
  "hazmatCertified",
  "rateBasis",
  "rate",
  "minCharge",
  "demurrage",
  "fuelSurcharge",
  "surchargeUnit",
  "contractStart",
  "contractEnd",
  "insuranceExpiry",
  "paymentTermsText",
  "rating",
  "onTimePct",
  "accuracyPct",
  "tripsYtd",
  "volumeYtd",
  "notes",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

export type HaulierInput = {
  code: string;
  name: string;
  registration: string | null;
  dispatchContact: string | null;
  dispatchPhone: string | null;
  email: string | null;
  vehicleTypes: (typeof VEHICLE_TYPES)[number][];
  unitsAvailable: number | null;
  zoneIds: string[] | null;
  hazmatCertified: boolean;
  rateBasis: (typeof RATE_BASES)[number];
  rate: number;
  minCharge: number | null;
  demurrage: number | null;
  fuelSurcharge: number | null;
  surchargeUnit: (typeof SURCHARGE_UNITS)[number];
  contractStart: string;
  contractEnd: string;
  insuranceExpiry: string | null;
  paymentTermsText: string | null;
  rating: number | null;
  onTimePct: number | null;
  accuracyPct: number | null;
  tripsYtd: number | null;
  volumeYtd: number | null;
  notes: string | null;
  validFrom: string;
  validTo: string | null;
  reason: (typeof CHANGE_REASONS)[number];
  changeNote: string | null;
  externalId: string | null;
  versionNo?: number;
};

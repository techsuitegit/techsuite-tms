export const VEHICLE_CLASSES = [
  "BOBTAIL_LPG",
  "BOBTAIL_REFINED",
  "TRANSPORT_TRACTOR",
  "TANK_TRAILER",
  "CYLINDER_TRUCK",
] as const;

export const HAZMAT_CLASSES = ["CLASS_2_1", "CLASS_3", "COMBINED", "NON_HAZMAT"] as const;

export const AXLE_CONFIGS = ["AXLE_2_RIGID", "AXLE_3_RIGID", "TRACTOR_TRI"] as const;

export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;

export const CREATE_FIELDS = [
  "code",
  "plate",
  "vin",
  "make",
  "model",
  "modelYear",
  "vehicleClass",
  "shippingPointId",
  "divisionId",
  "costCentreId",
  "capacity",
  "capacityUomId",
  "compartments",
  "gvwKg",
  "tareKg",
  "heightM",
  "lengthM",
  "hazmatClass",
  "axleConfig",
  "ptlMinPct",
  "gpsDeviceId",
  "insuranceExpiry",
  "fitnessExpiry",
  "permitExpiry",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

export type CompartmentInput = {
  seq: number;
  materialId: string | null;
  volume: number | null;
};

export type VehicleInput = {
  code: string;
  plate: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  vehicleClass: (typeof VEHICLE_CLASSES)[number];
  shippingPointId: string;
  divisionId: string;
  costCentreId: string;
  capacity: number;
  capacityUomId: string;
  compartments: CompartmentInput[];
  gvwKg: number | null;
  tareKg: number | null;
  heightM: number | null;
  lengthM: number | null;
  hazmatClass: (typeof HAZMAT_CLASSES)[number] | null;
  axleConfig: (typeof AXLE_CONFIGS)[number] | null;
  ptlMinPct: number | null;
  gpsDeviceId: string | null;
  insuranceExpiry: string | null;
  fitnessExpiry: string | null;
  permitExpiry: string | null;
  validFrom: string;
  validTo: string | null;
  reason: (typeof CHANGE_REASONS)[number];
  changeNote: string | null;
  externalId: string | null;
  versionNo?: number;
};

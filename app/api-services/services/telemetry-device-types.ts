export const PAIRING_STATES = ["PAIRED_REPORTING", "PAIRED_NO_SIGNAL", "UNPAIRED_STOCK"] as const;

export const CADENCES = ["M15", "H1", "H4", "D1"] as const;

export const HEALTH_STATES = ["HEALTHY", "BATTERY_LOW", "NO_SIGNAL", "FAULTY"] as const;

export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;

export const CREATE_FIELDS = [
  "code",
  "vendorId",
  "model",
  "imei",
  "pairingState",
  "storageTankId",
  "cadence",
  "health",
  "batteryPct",
  "signal",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

export type TelemetryDeviceInput = {
  code: string;
  vendorId: string;
  model: string | null;
  imei: string | null;
  pairingState: (typeof PAIRING_STATES)[number];
  storageTankId: string | null;
  cadence: (typeof CADENCES)[number] | null;
  health: (typeof HEALTH_STATES)[number];
  batteryPct: number | null;
  signal: string | null;
  validFrom: string;
  validTo: string | null;
  reason: (typeof CHANGE_REASONS)[number];
  changeNote: string | null;
  externalId: string | null;
  versionNo?: number;
};

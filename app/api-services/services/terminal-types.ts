export const TERMINAL_OWNERSHIPS = ["OWN", "THIRD_PARTY"] as const;
export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;
export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export type TerminalOwnership = (typeof TERMINAL_OWNERSHIPS)[number];
export type ChangeReason = (typeof CHANGE_REASONS)[number];

export type TerminalInput = {
  code: string;
  name: string;
  ownership: TerminalOwnership;
  shippingPointId: string;
  vendorId?: string | null;
  isParent: boolean;
  address: string;
  countryId: string;
  stateCode: string;
  cityCode: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  productsAvailable: string[];
  rackPriceRef?: string | null;
  freightToSp?: number | null;
  hazmatClass?: string | null;
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
  "shippingPointId",
  "vendorId",
  "isParent",
  "address",
  "countryId",
  "stateCode",
  "cityCode",
  "pincode",
  "latitude",
  "longitude",
  "productsAvailable",
  "rackPriceRef",
  "freightToSp",
  "hazmatClass",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

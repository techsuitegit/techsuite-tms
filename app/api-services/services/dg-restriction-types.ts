/** Shared with Material dg_profile (minus "—"). Empty array on a zone = all vehicles. */
export const DG_CLASSES = ["Class 2.1", "Class 3"] as const;

export const GEOM_SOURCES = [
  "SURVEYED",
  "DIGITISED_FROM_NOTIFICATION",
  "VENDOR_SUPPLIED",
  "SKETCHED",
] as const;

export const SOURCE_KINDS = [
  "STATUTE",
  "RULE",
  "NOTIFICATION",
  "STRUCTURAL_CERTIFICATE",
  "CLIENT_ADVICE",
  "ILLUSTRATIVE",
] as const;

export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;

export const CREATE_FIELDS = [
  "code",
  "name",
  "kindCode",
  "dgClasses",
  "geometry",
  "geomSource",
  "windowFromMin",
  "windowToMin",
  "params",
  "sourceKind",
  "sourceRef",
  "sourceAuthority",
  "sourceDated",
  "sourceUrl",
  "reviewDue",
  "notes",
  "isActive",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

export type DgRestrictionInput = {
  code: string;
  name: string;
  kindCode: string;
  dgClasses: string[];
  geometry: GeoJsonPolygon;
  geomSource: (typeof GEOM_SOURCES)[number];
  windowFromMin: number;
  windowToMin: number;
  params: Record<string, unknown>;
  sourceKind: (typeof SOURCE_KINDS)[number];
  sourceRef: string;
  sourceAuthority: string | null;
  sourceDated: string | null;
  sourceUrl: string | null;
  reviewDue: string;
  notes: string | null;
  isActive: boolean;
  validFrom: string;
  validTo: string | null;
  reason: (typeof CHANGE_REASONS)[number];
  changeNote: string | null;
  externalId: string | null;
  versionNo?: number;
};

export type DgRestrictionKindRow = {
  code: string;
  name: string;
  requiredParams: string[];
  paramTypes: Record<string, string>;
  vehicleAttribute: string | null;
  isTimeScoped: boolean;
  comparatorStatus: string;
};

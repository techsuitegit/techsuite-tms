export const MATERIAL_GROUPS = ["FUEL-MS", "FUEL-HSD", "FUEL-LPG", "CYL", "LUBE"] as const;
export const ITEM_CATEGORY_GROUPS = ["NORM", "HAZMAT", "PACK"] as const;
export const DG_PROFILES = ["Class 2.1", "Class 3", "—"] as const;
export const MASTER_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;
export const CHANGE_REASONS = ["Correction", "New record", "Regulatory update", "Commercial change"] as const;

export type MaterialGroup = (typeof MATERIAL_GROUPS)[number];
export type ItemCategoryGroup = (typeof ITEM_CATEGORY_GROUPS)[number];
export type DgProfile = (typeof DG_PROFILES)[number];
export type ChangeReason = (typeof CHANGE_REASONS)[number];

export type MaterialInput = {
  code: string;
  name: string;
  industryDesc?: string | null;
  basicMaterial?: string | null;
  materialGroup?: MaterialGroup | null;
  itemCategoryGroup?: ItemCategoryGroup | null;
  authGroup?: string | null;
  crossPlant?: boolean | null;
  longText?: string | null;
  dgProfile?: DgProfile | null;
  dgPackStatus?: string | null;
  packagingCode?: string | null;
  envRelevant?: boolean | null;
  inBulkLiquid?: boolean | null;
  highlyViscous?: boolean | null;
  unNumber?: string | null;
  baseUomId: string;
  altUomId?: string | null;
  altFactor?: number | null;
  grossWeight?: number | null;
  weightUomId?: string | null;
  netWeight?: number | null;
  volume?: number | null;
  volumeUomId?: string | null;
  dimensions?: string | null;
  ean?: string | null;
  eanCategory?: string | null;
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
  "industryDesc",
  "basicMaterial",
  "materialGroup",
  "itemCategoryGroup",
  "authGroup",
  "crossPlant",
  "longText",
  "dgProfile",
  "dgPackStatus",
  "packagingCode",
  "envRelevant",
  "inBulkLiquid",
  "highlyViscous",
  "unNumber",
  "baseUomId",
  "altUomId",
  "altFactor",
  "grossWeight",
  "weightUomId",
  "netWeight",
  "volume",
  "volumeUomId",
  "dimensions",
  "ean",
  "eanCategory",
  "validFrom",
  "validTo",
  "reason",
  "changeNote",
  "externalId",
] as const;

export const UPDATE_FIELDS = [...CREATE_FIELDS, "versionNo"] as const;

export const SAP_UPSERT_FIELDS = CREATE_FIELDS;

import { MdmError } from "../errors/mdm-error";
import {
  CHANGE_REASONS,
  CREATE_FIELDS,
  DG_PROFILES,
  ITEM_CATEGORY_GROUPS,
  MASTER_STATUSES,
  MATERIAL_GROUPS,
  SAP_UPSERT_FIELDS,
  UPDATE_FIELDS,
  type MaterialInput,
} from "./material-types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9._\-/]{1,40}$/;

export function parseCreateBody(body: Record<string, unknown>): MaterialInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body, false);
}

export function parseUpdateBody(body: Record<string, unknown>): MaterialInput {
  rejectUnknown(body, UPDATE_FIELDS);
  const parsed = parseFields(body, false);
  if (typeof body.versionNo !== "number" || !Number.isInteger(body.versionNo) || body.versionNo < 1) {
    throw new MdmError("VALIDATION", "versionNo is required", 400, "versionNo");
  }
  parsed.versionNo = body.versionNo;
  return parsed;
}

export function parseSapUpsertBody(body: Record<string, unknown>): MaterialInput {
  rejectUnknown(body, SAP_UPSERT_FIELDS);
  const parsed = parseFields(body, true);
  if (!parsed.externalId) {
    throw new MdmError("VALIDATION", "missing SAP key", 400, "externalId");
  }
  return parsed;
}

export function parseStatusFilter(value: string | null) {
  if (!value) return null;
  if (!MASTER_STATUSES.includes(value as (typeof MASTER_STATUSES)[number])) {
    throw new MdmError("VALIDATION", "Invalid status filter", 400, "status");
  }
  return value;
}

function parseFields(body: Record<string, unknown>, sap: boolean): MaterialInput {
  const code = requiredString(body, "code").toUpperCase();
  if (!CODE_RE.test(code)) {
    throw new MdmError("VALIDATION", "code must be 1-40 letters, digits, or . _ - /", 400, "code");
  }
  const name = requiredString(body, "name");
  const baseUomId = requiredUuid(body, "baseUomId");
  const altUomId = optionalUuid(body, "altUomId");
  const altFactor = optionalNumber(body, "altFactor");
  if (altUomId && altFactor == null) {
    throw new MdmError("VALIDATION", "altFactor is required when altUomId is set", 400, "altFactor");
  }
  if (!altUomId && altFactor != null) {
    throw new MdmError("VALIDATION", "altFactor is only allowed when altUomId is set", 400, "altFactor");
  }
  const validFrom = optionalDate(body, "validFrom") ?? (sap ? todayIso() : null);
  if (!validFrom) throw new MdmError("VALIDATION", "validFrom is required", 400, "validFrom");
  const validTo = optionalDate(body, "validTo");
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }
  const reason =
    body.reason == null || body.reason === ""
      ? "New record"
      : requiredEnum(body, "reason", CHANGE_REASONS);

  return {
    code,
    name,
    industryDesc: optionalString(body, "industryDesc"),
    basicMaterial: optionalString(body, "basicMaterial"),
    materialGroup: optionalEnum(body, "materialGroup", MATERIAL_GROUPS),
    itemCategoryGroup: optionalEnum(body, "itemCategoryGroup", ITEM_CATEGORY_GROUPS),
    authGroup: optionalString(body, "authGroup"),
    crossPlant: optionalBoolean(body, "crossPlant"),
    longText: optionalString(body, "longText"),
    dgProfile: optionalEnum(body, "dgProfile", DG_PROFILES),
    dgPackStatus: optionalString(body, "dgPackStatus"),
    packagingCode: optionalString(body, "packagingCode"),
    envRelevant: optionalBoolean(body, "envRelevant"),
    inBulkLiquid: optionalBoolean(body, "inBulkLiquid"),
    highlyViscous: optionalBoolean(body, "highlyViscous"),
    unNumber: optionalString(body, "unNumber"),
    baseUomId,
    altUomId,
    altFactor,
    grossWeight: optionalNumber(body, "grossWeight"),
    weightUomId: optionalUuid(body, "weightUomId"),
    netWeight: optionalNumber(body, "netWeight"),
    volume: optionalNumber(body, "volume"),
    volumeUomId: optionalUuid(body, "volumeUomId"),
    dimensions: optionalString(body, "dimensions"),
    ean: optionalString(body, "ean"),
    eanCategory: optionalString(body, "eanCategory"),
    validFrom,
    validTo,
    reason,
    changeNote: optionalString(body, "changeNote"),
    externalId: optionalString(body, "externalId"),
  };
}

function rejectUnknown(body: Record<string, unknown>, allowed: readonly string[]) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      throw new MdmError("VALIDATION", `Unknown field ${key}`, 400, key);
    }
  }
}

function requiredString(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new MdmError("VALIDATION", `${field} is required`, 400, field);
  }
  return value.trim();
}

function requiredEnum<T extends string>(body: Record<string, unknown>, field: string, allowed: readonly T[]): T {
  const value = requiredString(body, field);
  if (!allowed.includes(value as T)) {
    throw new MdmError("VALIDATION", `${field} is invalid`, 400, field);
  }
  return value as T;
}

function optionalEnum<T extends string>(body: Record<string, unknown>, field: string, allowed: readonly T[]) {
  const value = optionalString(body, field);
  if (!value) return null;
  if (!allowed.includes(value as T)) {
    throw new MdmError("VALIDATION", `${field} is invalid`, 400, field);
  }
  return value as T;
}

function requiredUuid(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!UUID_RE.test(value)) {
    throw new MdmError("VALIDATION", `${field} must be a UUID`, 400, field);
  }
  return value;
}

function optionalUuid(body: Record<string, unknown>, field: string) {
  const value = optionalString(body, field);
  if (!value) return null;
  if (!UUID_RE.test(value)) {
    throw new MdmError("VALIDATION", `${field} must be a UUID`, 400, field);
  }
  return value;
}

function optionalString(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new MdmError("VALIDATION", `${field} must be text`, 400, field);
  }
  return value.trim() || null;
}

function optionalDate(body: Record<string, unknown>, field: string) {
  const value = optionalString(body, field);
  if (!value) return null;
  if (!DATE_RE.test(value)) {
    throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  }
  return value;
}

function optionalNumber(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new MdmError("VALIDATION", `${field} must be a number`, 400, field);
  }
  return value;
}

function optionalBoolean(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null) return null;
  if (typeof value !== "boolean") {
    throw new MdmError("VALIDATION", `${field} must be true or false`, 400, field);
  }
  return value;
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

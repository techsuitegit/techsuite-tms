import { MdmError } from "./mdm-error";
import {
  CHANGE_REASONS,
  CREATE_FIELDS,
  MASTER_STATUSES,
  SHIPPING_POINT_TYPES,
  UPDATE_FIELDS,
  type ShippingPointInput,
} from "./shipping-point-types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FORBIDDEN = [/\bdepot\b/i, /dispatch centre/i, /dispatch center/i];

export function assertNoForbiddenLabels(value: string, field: string) {
  for (const pattern of FORBIDDEN) {
    if (pattern.test(value)) {
      throw new MdmError("FORBIDDEN_LABEL", "Use Shipping Point, never Depot or Dispatch Centre", 400, field);
    }
  }
}

export function parseCreateBody(body: Record<string, unknown>): ShippingPointInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body, false);
}

export function parseUpdateBody(body: Record<string, unknown>): ShippingPointInput {
  rejectUnknown(body, UPDATE_FIELDS);
  const parsed = parseFields(body, true);
  if (typeof body.versionNo !== "number" || !Number.isInteger(body.versionNo) || body.versionNo < 1) {
    throw new MdmError("VALIDATION", "versionNo is required", 400, "versionNo");
  }
  parsed.versionNo = body.versionNo;
  return parsed;
}

function rejectUnknown(body: Record<string, unknown>, allowed: readonly string[]) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      throw new MdmError("VALIDATION", `Unknown field ${key}`, 400, key);
    }
  }
}

function parseFields(body: Record<string, unknown>, partial: boolean): ShippingPointInput {
  const code = requiredString(body, "code", partial).toUpperCase();
  const name = requiredString(body, "name", partial);
  const divisionId = requiredString(body, "divisionId", partial);
  const type = requiredEnum(body, "type", SHIPPING_POINT_TYPES, partial);
  const address = requiredString(body, "address", partial);
  const latitude = requiredNumber(body, "latitude", partial);
  const longitude = requiredNumber(body, "longitude", partial);
  const validFrom = requiredDate(body, "validFrom", partial);
  const reason = requiredEnum(body, "reason", CHANGE_REASONS, partial);

  if (!UUID_RE.test(divisionId)) {
    throw new MdmError("VALIDATION", "divisionId must be a UUID", 400, "divisionId");
  }
  if (latitude < -90 || latitude > 90) {
    throw new MdmError("VALIDATION", "latitude must be between -90 and 90", 400, "latitude");
  }
  if (longitude < -180 || longitude > 180) {
    throw new MdmError("VALIDATION", "longitude must be between -180 and 180", 400, "longitude");
  }

  for (const [field, value] of Object.entries({ code, name, address })) {
    assertNoForbiddenLabels(value, field);
  }

  const validTo = optionalDate(body, "validTo");
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }

  optionalString(body, "openingHours");
  optionalString(body, "leadDispatcher");
  optionalString(body, "phone");
  optionalString(body, "hazmatClass");
  optionalString(body, "permitNo");
  optionalString(body, "erpRef");
  optionalString(body, "changeNote");
  optionalString(body, "externalId");

  return {
    code,
    name,
    divisionId,
    type,
    address,
    latitude,
    longitude,
    geofenceRadiusM: optionalInt(body, "geofenceRadiusM"),
    openingHours: optionalString(body, "openingHours"),
    loadingBays: optionalInt(body, "loadingBays"),
    loadingRateLpm: optionalNumber(body, "loadingRateLpm"),
    midShiftReload: optionalBoolean(body, "midShiftReload"),
    productsStocked: optionalStringArray(body, "productsStocked"),
    leadDispatcher: optionalString(body, "leadDispatcher"),
    phone: optionalString(body, "phone"),
    hazmatClass: optionalString(body, "hazmatClass"),
    permitNo: optionalString(body, "permitNo"),
    permitExpiry: optionalDate(body, "permitExpiry"),
    erpRef: optionalString(body, "erpRef"),
    validFrom,
    validTo,
    reason,
    changeNote: optionalString(body, "changeNote"),
    externalId: optionalString(body, "externalId"),
  };
}

export function parseStatusFilter(value: string | null) {
  if (!value) return null;
  if (!MASTER_STATUSES.includes(value as (typeof MASTER_STATUSES)[number])) {
    throw new MdmError("VALIDATION", "Invalid status filter", 400, "status");
  }
  return value;
}

function requiredString(body: Record<string, unknown>, field: string, partial: boolean) {
  const value = body[field];
  if (value == null) {
    if (partial) throw new MdmError("VALIDATION", `${field} is required`, 400, field);
    throw new MdmError("VALIDATION", `${field} is required`, 400, field);
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new MdmError("VALIDATION", `${field} is required`, 400, field);
  }
  return value.trim();
}

function requiredNumber(body: Record<string, unknown>, field: string, _partial: boolean) {
  const value = body[field];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new MdmError("VALIDATION", `${field} must be a number`, 400, field);
  }
  return value;
}

function requiredDate(body: Record<string, unknown>, field: string, _partial: boolean) {
  const value = requiredString(body, field, false);
  if (!DATE_RE.test(value)) {
    throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  }
  return value;
}

function requiredEnum<T extends string>(body: Record<string, unknown>, field: string, allowed: readonly T[], _partial: boolean): T {
  const value = requiredString(body, field, false);
  if (!allowed.includes(value as T)) {
    throw new MdmError("VALIDATION", `${field} is invalid`, 400, field);
  }
  return value as T;
}

function optionalString(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new MdmError("VALIDATION", `${field} must be text`, 400, field);
  }
  const trimmed = value.trim();
  if (trimmed) assertNoForbiddenLabels(trimmed, field);
  return trimmed || null;
}

function optionalDate(body: Record<string, unknown>, field: string) {
  const value = optionalString(body, field);
  if (!value) return null;
  if (!DATE_RE.test(value)) {
    throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  }
  return value;
}

function optionalInt(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new MdmError("VALIDATION", `${field} must be a whole number`, 400, field);
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

function optionalStringArray(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new MdmError("VALIDATION", `${field} must be an array of text codes`, 400, field);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

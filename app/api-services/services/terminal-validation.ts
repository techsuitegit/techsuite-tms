import { MdmError } from "../errors/mdm-error";
import {
  CHANGE_REASONS,
  CREATE_FIELDS,
  MASTER_STATUSES,
  TERMINAL_OWNERSHIPS,
  UPDATE_FIELDS,
  type TerminalInput,
} from "./terminal-types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseCreateBody(body: Record<string, unknown>): TerminalInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body);
}

export function parseUpdateBody(body: Record<string, unknown>): TerminalInput {
  rejectUnknown(body, UPDATE_FIELDS);
  const parsed = parseFields(body);
  if (typeof body.versionNo !== "number" || !Number.isInteger(body.versionNo) || body.versionNo < 1) {
    throw new MdmError("VALIDATION", "versionNo is required", 400, "versionNo");
  }
  parsed.versionNo = body.versionNo;
  return parsed;
}

export function parseStatusFilter(value: string | null) {
  if (!value) return null;
  if (!MASTER_STATUSES.includes(value as (typeof MASTER_STATUSES)[number])) {
    throw new MdmError("VALIDATION", "Invalid status filter", 400, "status");
  }
  return value;
}

function rejectUnknown(body: Record<string, unknown>, allowed: readonly string[]) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      throw new MdmError("VALIDATION", `Unknown field ${key}`, 400, key);
    }
  }
}

function parseFields(body: Record<string, unknown>): TerminalInput {
  const code = requiredString(body, "code").toUpperCase();
  const name = requiredString(body, "name");
  const ownership = requiredEnum(body, "ownership", TERMINAL_OWNERSHIPS);
  const shippingPointId = requiredUuid(body, "shippingPointId");
  const address = requiredString(body, "address");
  const countryId = requiredString(body, "countryId").toUpperCase();
  const stateCode = requiredString(body, "stateCode");
  const cityCode = requiredString(body, "cityCode");
  const pincode = requiredString(body, "pincode");
  const validFrom = requiredDate(body, "validFrom");
  const reason = requiredEnum(body, "reason", CHANGE_REASONS);
  const vendorId = optionalUuid(body, "vendorId");
  const latitude = optionalNumber(body, "latitude");
  const longitude = optionalNumber(body, "longitude");
  const validTo = optionalDate(body, "validTo");

  if (ownership === "OWN" && vendorId) {
    throw new MdmError("VALIDATION", "vendorId must be empty when ownership is OWN", 400, "vendorId");
  }
  if (ownership === "THIRD_PARTY" && !vendorId) {
    throw new MdmError("VALIDATION", "vendorId is required when ownership is THIRD_PARTY", 400, "vendorId");
  }
  if (latitude != null && (latitude < -90 || latitude > 90)) {
    throw new MdmError("VALIDATION", "latitude must be between -90 and 90", 400, "latitude");
  }
  if (longitude != null && (longitude < -180 || longitude > 180)) {
    throw new MdmError("VALIDATION", "longitude must be between -180 and 180", 400, "longitude");
  }
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }
  if (countryId === "IND" && !/^\d{6}$/.test(pincode)) {
    throw new MdmError("VALIDATION", "pincode must be 6 digits for India", 400, "pincode");
  }

  return {
    code,
    name,
    ownership,
    shippingPointId,
    vendorId,
    isParent: optionalBoolean(body, "isParent") ?? false,
    address,
    countryId,
    stateCode,
    cityCode,
    pincode,
    latitude,
    longitude,
    productsAvailable: optionalStringArray(body, "productsAvailable"),
    rackPriceRef: optionalString(body, "rackPriceRef"),
    freightToSp: optionalNumber(body, "freightToSp"),
    hazmatClass: optionalString(body, "hazmatClass"),
    validFrom,
    validTo,
    reason,
    changeNote: optionalString(body, "changeNote"),
    externalId: optionalString(body, "externalId"),
  };
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

function requiredDate(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!DATE_RE.test(value)) {
    throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  }
  return value;
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

function optionalStringArray(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new MdmError("VALIDATION", `${field} must be an array of text codes`, 400, field);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

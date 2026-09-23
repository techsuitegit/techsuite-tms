import { MdmError } from "../errors/mdm-error";
import {
  CHANGE_REASONS,
  CREATE_FIELDS,
  MASTER_STATUSES,
  SAP_UPSERT_FIELDS,
  UOM_DIMENSIONS,
  UOM_ROUNDINGS,
  UPDATE_FIELDS,
  type UomInput,
} from "./uom-types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9]{1,10}$/;

export function parseCreateBody(body: Record<string, unknown>): UomInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body, false);
}

export function parseUpdateBody(body: Record<string, unknown>): UomInput {
  rejectUnknown(body, UPDATE_FIELDS);
  const parsed = parseFields(body, false);
  if (typeof body.versionNo !== "number" || !Number.isInteger(body.versionNo) || body.versionNo < 1) {
    throw new MdmError("VALIDATION", "versionNo is required", 400, "versionNo");
  }
  parsed.versionNo = body.versionNo;
  return parsed;
}

export function parseSapUpsertBody(body: Record<string, unknown>): UomInput {
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

function parseFields(body: Record<string, unknown>, sap: boolean): UomInput {
  const code = requiredString(body, "code").toUpperCase();
  if (!CODE_RE.test(code)) {
    throw new MdmError("VALIDATION", "code must be 1-10 letters or digits", 400, "code");
  }
  const name = requiredString(body, "name");
  const isBase = requiredBoolean(body, "isBase");
  const factorToBase = requiredPositiveNumber(body, "factorToBase");
  const decimalPlaces = requiredInt(body, "decimalPlaces");
  if (decimalPlaces < 0) {
    throw new MdmError("VALIDATION", "decimalPlaces must be 0 or more", 400, "decimalPlaces");
  }
  const rounding = requiredEnum(body, "rounding", UOM_ROUNDINGS);
  const dimension = optionalEnum(body, "dimension", UOM_DIMENSIONS);
  const validFrom = optionalDate(body, "validFrom") ?? (sap ? todayIso() : null);
  if (!validFrom) throw new MdmError("VALIDATION", "validFrom is required", 400, "validFrom");
  const validTo = optionalDate(body, "validTo");
  const reason = body.reason == null || body.reason === ""
    ? "New record"
    : requiredEnum(body, "reason", CHANGE_REASONS);
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }
  return {
    code,
    name,
    isBase,
    factorToBase,
    decimalPlaces,
    rounding,
    dimension,
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

function requiredBoolean(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "boolean") {
    throw new MdmError("VALIDATION", `${field} must be true or false`, 400, field);
  }
  return value;
}

function requiredPositiveNumber(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    throw new MdmError("VALIDATION", `${field} must be a number greater than 0`, 400, field);
  }
  return value;
}

function requiredInt(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new MdmError("VALIDATION", `${field} must be an integer`, 400, field);
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

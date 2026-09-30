import { MdmError } from "../errors/mdm-error";
import {
  CHANGE_REASONS,
  CREATE_FIELDS,
  CUSTODY_STATES,
  CYLINDER_SIZES,
  MASTER_STATUSES,
  UPDATE_FIELDS,
  VALVE_TYPES,
  type CylinderInput,
} from "./cylinder-types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9._\-/]{1,40}$/;

export function parseCreateBody(body: Record<string, unknown>): CylinderInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body);
}

export function parseUpdateBody(body: Record<string, unknown>): CylinderInput {
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

export function isRequalPast(due: string) {
  return due < todayIso();
}

function parseFields(body: Record<string, unknown>): CylinderInput {
  const code = requiredString(body, "code").toUpperCase();
  if (!CODE_RE.test(code)) {
    throw new MdmError("VALIDATION", "code must be 1-40 letters, digits, or . _ - /", 400, "code");
  }
  const serial = requiredString(body, "serial");
  if (serial.length > 40) throw new MdmError("VALIDATION", "serial must be 1-40 characters", 400, "serial");
  const validFrom = requiredDate(body, "validFrom");
  const validTo = optionalDate(body, "validTo");
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }

  return {
    code,
    serial,
    rfid: optionalString(body, "rfid"),
    size: requiredEnum(body, "size", CYLINDER_SIZES),
    materialId: requiredUuid(body, "materialId"),
    tareKg: requiredPositiveNumber(body, "tareKg"),
    fillCapacity: requiredPositiveNumber(body, "fillCapacity"),
    valveType: optionalEnum(body, "valveType", VALVE_TYPES),
    requalificationDue: requiredDate(body, "requalificationDue"),
    custodyState: requiredEnum(body, "custodyState", CUSTODY_STATES),
    locationText: optionalString(body, "locationText"),
    shippingPointId: optionalUuid(body, "shippingPointId"),
    validFrom,
    validTo,
    reason: requiredEnum(body, "reason", CHANGE_REASONS),
    changeNote: optionalString(body, "changeNote"),
    externalId: optionalString(body, "externalId"),
  };
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function rejectUnknown(body: Record<string, unknown>, allowed: readonly string[]) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) throw new MdmError("VALIDATION", `Unknown field ${key}`, 400, key);
  }
}

function requiredString(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new MdmError("VALIDATION", `${field} is required`, 400, field);
  return value.trim();
}

function requiredEnum<T extends string>(body: Record<string, unknown>, field: string, allowed: readonly T[]): T {
  const value = requiredString(body, field);
  if (!allowed.includes(value as T)) throw new MdmError("VALIDATION", `${field} is invalid`, 400, field);
  return value as T;
}

function optionalEnum<T extends string>(body: Record<string, unknown>, field: string, allowed: readonly T[]): T | null {
  const value = optionalString(body, field);
  if (!value) return null;
  if (!allowed.includes(value as T)) throw new MdmError("VALIDATION", `${field} is invalid`, 400, field);
  return value as T;
}

function requiredUuid(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!UUID_RE.test(value)) throw new MdmError("VALIDATION", `${field} must be a UUID`, 400, field);
  return value;
}

function requiredDate(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!DATE_RE.test(value)) throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  return value;
}

function requiredPositiveNumber(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    throw new MdmError("VALIDATION", `${field} must be a number greater than 0`, 400, field);
  }
  return value;
}

function optionalString(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new MdmError("VALIDATION", `${field} must be text`, 400, field);
  return value.trim() || null;
}

function optionalUuid(body: Record<string, unknown>, field: string) {
  const value = optionalString(body, field);
  if (!value) return null;
  if (!UUID_RE.test(value)) throw new MdmError("VALIDATION", `${field} must be a UUID`, 400, field);
  return value;
}

function optionalDate(body: Record<string, unknown>, field: string) {
  const value = optionalString(body, field);
  if (!value) return null;
  if (!DATE_RE.test(value)) throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  return value;
}

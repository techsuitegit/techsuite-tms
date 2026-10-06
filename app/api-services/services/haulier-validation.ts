import { MdmError } from "../errors/mdm-error";
import { isZoneId } from "./zone-validation";
import {
  CHANGE_REASONS,
  CREATE_FIELDS,
  MASTER_STATUSES,
  RATE_BASES,
  SURCHARGE_UNITS,
  UPDATE_FIELDS,
  VEHICLE_TYPES,
  type HaulierInput,
} from "./haulier-types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9._\-/]{1,40}$/;
const HAULIER_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Z0-9][A-Z0-9._\-/]{0,39})$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isHaulierId(value: string) {
  return HAULIER_ID_RE.test(value);
}

export function parseCreateBody(body: Record<string, unknown>): HaulierInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body, false);
}

export function parseUpdateBody(body: Record<string, unknown>): HaulierInput {
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

export function isExpiring(contractEnd: string) {
  return contractEnd.slice(0, 10) < plusDays(60);
}

function parseFields(body: Record<string, unknown>, requireCode = true): HaulierInput {
  const code = readCode(body, requireCode);
  const validFrom = requiredDate(body, "validFrom");
  const validTo = optionalDate(body, "validTo");
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }
  const contractStart = requiredDate(body, "contractStart");
  const contractEnd = requiredDate(body, "contractEnd");
  if (contractEnd < contractStart) {
    throw new MdmError("VALIDATION", "contractEnd must be on or after contractStart", 400, "contractEnd");
  }
  const email = optionalString(body, "email");
  if (email && !EMAIL_RE.test(email)) throw new MdmError("VALIDATION", "email is invalid", 400, "email");

  return {
    code,
    name: requiredString(body, "name"),
    registration: optionalString(body, "registration"),
    dispatchContact: optionalString(body, "dispatchContact"),
    dispatchPhone: optionalString(body, "dispatchPhone"),
    email,
    vehicleTypes: requiredVehicleTypes(body),
    unitsAvailable: optionalInt(body, "unitsAvailable", 0),
    zoneIds: optionalUuidList(body, "zoneIds"),
    hazmatCertified: requiredBoolean(body, "hazmatCertified"),
    rateBasis: requiredEnum(body, "rateBasis", RATE_BASES),
    rate: requiredMoney(body, "rate", true),
    minCharge: optionalMoney(body, "minCharge"),
    demurrage: optionalMoney(body, "demurrage"),
    fuelSurcharge: optionalMoney(body, "fuelSurcharge"),
    surchargeUnit: optionalEnum(body, "surchargeUnit", SURCHARGE_UNITS) ?? "PCT",
    contractStart,
    contractEnd,
    insuranceExpiry: optionalDate(body, "insuranceExpiry"),
    paymentTermsText: optionalString(body, "paymentTermsText"),
    rating: optionalRange(body, "rating", 1, 5),
    onTimePct: optionalRange(body, "onTimePct", 0, 100),
    accuracyPct: optionalRange(body, "accuracyPct", 0, 100),
    tripsYtd: optionalInt(body, "tripsYtd", 0),
    volumeYtd: optionalMoney(body, "volumeYtd"),
    notes: optionalString(body, "notes"),
    validFrom,
    validTo,
    reason: requiredEnum(body, "reason", CHANGE_REASONS),
    changeNote: optionalString(body, "changeNote"),
    externalId: optionalString(body, "externalId"),
  };
}

function plusDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function requiredVehicleTypes(body: Record<string, unknown>) {
  const value = body.vehicleTypes;
  if (!Array.isArray(value) || value.length === 0) {
    throw new MdmError("VALIDATION", "vehicleTypes is required", 400, "vehicleTypes");
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !VEHICLE_TYPES.includes(item as (typeof VEHICLE_TYPES)[number])) {
      throw new MdmError("VALIDATION", "vehicleTypes is invalid", 400, "vehicleTypes");
    }
    if (seen.has(item)) throw new MdmError("VALIDATION", "vehicleTypes contains a duplicate", 400, "vehicleTypes");
    seen.add(item);
  }
  return value as HaulierInput["vehicleTypes"];
}

function optionalUuidList(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null) return null;
  if (!Array.isArray(value)) throw new MdmError("VALIDATION", `${field} must be a list`, 400, field);
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !isZoneId(item)) {
      throw new MdmError("VALIDATION", `${field} must be UUIDs`, 400, field);
    }
    if (seen.has(item)) throw new MdmError("VALIDATION", `${field} contains a duplicate`, 400, field);
    seen.add(item);
  }
  return value;
}

function requiredMoney(body: Record<string, unknown>, field: string, positive: boolean) {
  const value = body[field];
  if (typeof value !== "number" || !Number.isFinite(value) || (positive ? value <= 0 : value < 0)) {
    throw new MdmError(
      "VALIDATION",
      positive ? `${field} must be a number greater than 0` : `${field} must be a number of 0 or more`,
      400,
      field,
    );
  }
  return money(value, field);
}

function optionalMoney(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new MdmError("VALIDATION", `${field} must be a number of 0 or more`, 400, field);
  }
  return money(value, field);
}

function money(value: number, field: string) {
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded - value) > 1e-9) {
    throw new MdmError("VALIDATION", `${field} must have at most 2 decimal places`, 400, field);
  }
  return rounded;
}

function optionalRange(body: Record<string, unknown>, field: string, min: number, max: number) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new MdmError("VALIDATION", `${field} must be from ${min} to ${max}`, 400, field);
  }
  return money(value, field);
}

function optionalInt(body: Record<string, unknown>, field: string, min: number) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new MdmError("VALIDATION", `${field} must be an integer of ${min} or more`, 400, field);
  }
  return value;
}

function requiredBoolean(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "boolean") throw new MdmError("VALIDATION", `${field} is required`, 400, field);
  return value;
}

function rejectUnknown(body: Record<string, unknown>, allowed: readonly string[]) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) throw new MdmError("VALIDATION", `Unknown field ${key}`, 400, key);
  }
}

function readCode(body: Record<string, unknown>, required: boolean) {
  const value = body.code;
  if (value == null || value === "") {
    if (!required) return "";
    throw new MdmError("VALIDATION", "code is required", 400, "code");
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new MdmError("VALIDATION", "code is required", 400, "code");
  }
  const code = value.trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    throw new MdmError("VALIDATION", "code must be 1-40 letters, digits, or . _ - /", 400, "code");
  }
  return code;
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

function requiredDate(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!DATE_RE.test(value)) throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  return value;
}

function optionalString(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new MdmError("VALIDATION", `${field} must be text`, 400, field);
  return value.trim() || null;
}

function optionalDate(body: Record<string, unknown>, field: string) {
  const value = optionalString(body, field);
  if (!value) return null;
  if (!DATE_RE.test(value)) throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  return value;
}

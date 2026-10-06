import { MdmError } from "../errors/mdm-error";
import { isStorageTankId } from "./storage-tank-validation";
import { isVendorId } from "./vendor-validation";
import {
  CADENCES,
  CHANGE_REASONS,
  CREATE_FIELDS,
  HEALTH_STATES,
  MASTER_STATUSES,
  PAIRING_STATES,
  UPDATE_FIELDS,
  type TelemetryDeviceInput,
} from "./telemetry-device-types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9._\-/]{1,40}$/;
const TELEMETRY_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Z0-9][A-Z0-9._\-/]{0,39})$/i;

export function isTelemetryDeviceId(value: string) {
  return TELEMETRY_ID_RE.test(value);
}

export function parseCreateBody(body: Record<string, unknown>): TelemetryDeviceInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body, false);
}

export function parseUpdateBody(body: Record<string, unknown>): TelemetryDeviceInput {
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

function parseFields(body: Record<string, unknown>, requireCode = true): TelemetryDeviceInput {
  const code = readCode(body, requireCode);
  const validFrom = requiredDate(body, "validFrom");
  const validTo = optionalDate(body, "validTo");
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }
  const pairingState = requiredEnum(body, "pairingState", PAIRING_STATES);
  const storageTankId = optionalStorageTankId(body, "storageTankId");
  if (pairingState === "UNPAIRED_STOCK" && storageTankId) {
    throw new MdmError("VALIDATION", "storageTankId must be null when pairingState is UNPAIRED_STOCK", 400, "storageTankId");
  }
  if (pairingState !== "UNPAIRED_STOCK" && !storageTankId) {
    throw new MdmError("VALIDATION", "storageTankId is required when pairingState is PAIRED", 400, "storageTankId");
  }

  return {
    code,
    vendorId: requiredVendorId(body, "vendorId"),
    model: optionalString(body, "model"),
    imei: optionalString(body, "imei"),
    pairingState,
    storageTankId,
    cadence: optionalEnum(body, "cadence", CADENCES),
    health: requiredEnum(body, "health", HEALTH_STATES),
    batteryPct: optionalBattery(body),
    signal: optionalString(body, "signal"),
    validFrom,
    validTo,
    reason: requiredEnum(body, "reason", CHANGE_REASONS),
    changeNote: optionalString(body, "changeNote"),
    externalId: optionalString(body, "externalId"),
  };
}

function optionalBattery(body: Record<string, unknown>) {
  const value = body.batteryPct;
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new MdmError("VALIDATION", "batteryPct must be an integer from 0 to 100", 400, "batteryPct");
  }
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

function requiredVendorId(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!isVendorId(value)) throw new MdmError("VALIDATION", `${field} must be a vendor id`, 400, field);
  return value;
}

function optionalStorageTankId(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !isStorageTankId(value)) {
    throw new MdmError("VALIDATION", `${field} must be a storage tank id`, 400, field);
  }
  return value;
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

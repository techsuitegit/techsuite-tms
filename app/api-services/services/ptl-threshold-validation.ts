import { MdmError } from "../errors/mdm-error";
import {
  BELOW_ACTIONS,
  CHANGE_REASONS,
  CREATE_FIELDS,
  MASTER_STATUSES,
  OVERRIDE_ROLES,
  UPDATE_FIELDS,
  VEHICLE_CLASSES,
  type PtlThresholdInput,
} from "./ptl-threshold-types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9._\-/]{1,40}$/;
const PTL_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Z0-9][A-Z0-9._\-/]{0,39})$/i;

export function isPtlThresholdId(value: string) {
  return PTL_ID_RE.test(value);
}

export function parseCreateBody(body: Record<string, unknown>): PtlThresholdInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body, false);
}

export function parseUpdateBody(body: Record<string, unknown>): PtlThresholdInput {
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

function parseFields(body: Record<string, unknown>, requireCode = true): PtlThresholdInput {
  const code = readCode(body, requireCode);
  const validFrom = requiredDate(body, "validFrom");
  const validTo = optionalDate(body, "validTo");
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }
  if (body.belowAction === "ALLOW_SILENT") {
    throw new MdmError("VALIDATION", "ALLOW_SILENT is not allowed", 400, "belowAction");
  }

  return {
    code,
    vehicleClass: requiredEnum(body, "vehicleClass", VEHICLE_CLASSES),
    minLoadPct: requiredPercent(body, "minLoadPct"),
    belowAction: requiredEnum(body, "belowAction", BELOW_ACTIONS),
    urgentExempt: requiredBoolean(body, "urgentExempt"),
    overrideRole: requiredEnum(body, "overrideRole", OVERRIDE_ROLES),
    validFrom,
    validTo,
    reason: requiredEnum(body, "reason", CHANGE_REASONS),
    changeNote: optionalString(body, "changeNote"),
    externalId: optionalString(body, "externalId"),
  };
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

function requiredBoolean(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "boolean") throw new MdmError("VALIDATION", `${field} is required`, 400, field);
  return value;
}

function requiredDate(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!DATE_RE.test(value)) throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  return value;
}

function requiredPercent(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "number" || Number.isNaN(value) || value < 1 || value > 100) {
    throw new MdmError("VALIDATION", `${field} must be a number from 1 to 100`, 400, field);
  }
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

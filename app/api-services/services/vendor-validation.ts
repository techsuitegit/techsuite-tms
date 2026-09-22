import { MdmError } from "../errors/mdm-error";
import {
  CHANGE_REASONS,
  MASTER_STATUSES,
  SAP_UPSERT_FIELDS,
  VENDOR_TYPES,
  type VendorInput,
} from "./vendor-types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseSapUpsertBody(body: Record<string, unknown>): VendorInput {
  rejectUnknown(body, SAP_UPSERT_FIELDS);

  const externalId = requiredSapKey(body);
  const code = requiredString(body, "code").toUpperCase();
  const name = requiredString(body, "name");
  const type = requiredEnum(body, "type", VENDOR_TYPES);
  const active = requiredBoolean(body, "active");
  const validFrom = optionalDate(body, "validFrom") ?? todayIso();
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
    type,
    active,
    validFrom,
    validTo,
    reason,
    changeNote: optionalString(body, "changeNote"),
    externalId,
  };
}

export function parseStatusFilter(value: string | null) {
  if (!value) return null;
  if (!MASTER_STATUSES.includes(value as (typeof MASTER_STATUSES)[number])) {
    throw new MdmError("VALIDATION", "Invalid status filter", 400, "status");
  }
  return value;
}

export function parseTypeFilter(value: string | null) {
  if (!value) return null;
  if (!VENDOR_TYPES.includes(value as (typeof VENDOR_TYPES)[number])) {
    throw new MdmError("VALIDATION", "type is invalid", 400, "type");
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

function requiredSapKey(body: Record<string, unknown>) {
  const value = body.externalId;
  if (typeof value !== "string" || !value.trim()) {
    throw new MdmError("VALIDATION", "missing SAP key", 400, "externalId");
  }
  return value.trim();
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

function requiredBoolean(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "boolean") {
    throw new MdmError("VALIDATION", `${field} must be true or false`, 400, field);
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

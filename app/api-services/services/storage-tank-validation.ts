import { MdmError } from "../errors/mdm-error";
import {
  CHANGE_REASONS,
  CREATE_FIELDS,
  MASTER_STATUSES,
  TANK_OWNERSHIPS,
  UPDATE_FIELDS,
  type StorageTankInput,
} from "./storage-tank-types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9._\-/]{1,40}$/;

export function parseCreateBody(body: Record<string, unknown>): StorageTankInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body);
}

export function parseUpdateBody(body: Record<string, unknown>): StorageTankInput {
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

function parseFields(body: Record<string, unknown>): StorageTankInput {
  const code = requiredString(body, "code").toUpperCase();
  if (!CODE_RE.test(code)) {
    throw new MdmError("VALIDATION", "code must be 1-40 letters, digits, or . _ - /", 400, "code");
  }
  const ownership = requiredEnum(body, "ownership", TANK_OWNERSHIPS);
  const capacityL = requiredPositiveNumber(body, "capacityL");
  const safeFillL = requiredPositiveNumber(body, "safeFillL");
  if (safeFillL > capacityL) {
    throw new MdmError("VALIDATION", "safeFillL must be less than or equal to capacityL", 400, "safeFillL");
  }
  const validFrom = requiredDate(body, "validFrom");
  const validTo = optionalDate(body, "validTo");
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }
  const legalEntityId = optionalUuid(body, "legalEntityId");
  const shippingPointId = optionalUuid(body, "shippingPointId");
  const customerCode = optionalString(body, "customerCode");
  const vendorId = optionalUuid(body, "vendorId");
  const dispatcherPointId = optionalUuid(body, "dispatcherPointId");
  assertOwnership(ownership, { legalEntityId, shippingPointId, customerCode, vendorId, dispatcherPointId });

  return {
    code,
    name: requiredString(body, "name"),
    ownership,
    materialId: requiredUuid(body, "materialId"),
    legalEntityId,
    shippingPointId,
    customerCode,
    vendorId,
    dispatcherPointId,
    capacityL,
    safeFillL,
    safetyStockL: optionalNumber(body, "safetyStockL"),
    reorderL: optionalNumber(body, "reorderL"),
    capacityUomId: optionalUuid(body, "capacityUomId"),
    gaugeType: optionalString(body, "gaugeType"),
    gaugeDeviceRef: optionalString(body, "gaugeDeviceRef"),
    lastCalibration: optionalDate(body, "lastCalibration"),
    inspectionDue: optionalDate(body, "inspectionDue"),
    certificate: optionalString(body, "certificate"),
    validFrom,
    validTo,
    reason: requiredEnum(body, "reason", CHANGE_REASONS),
    changeNote: optionalString(body, "changeNote"),
    externalId: optionalString(body, "externalId"),
  };
}

function assertOwnership(
  ownership: StorageTankInput["ownership"],
  fields: {
    legalEntityId: string | null;
    shippingPointId: string | null;
    customerCode: string | null;
    vendorId: string | null;
    dispatcherPointId: string | null;
  },
) {
  if (ownership === "OWN") {
    if (!fields.legalEntityId) throw new MdmError("VALIDATION", "legalEntityId is required when ownership is OWN", 400, "legalEntityId");
    if (!fields.shippingPointId) {
      throw new MdmError("VALIDATION", "shippingPointId is required when ownership is OWN", 400, "shippingPointId");
    }
    rejectSet(fields.vendorId, "vendorId", "OWN");
    rejectSet(fields.customerCode, "customerCode", "OWN");
    rejectSet(fields.dispatcherPointId, "dispatcherPointId", "OWN");
    return;
  }
  if (ownership === "CUSTOMER") {
    if (!fields.customerCode) {
      throw new MdmError("VALIDATION", "customerCode is required when ownership is CUSTOMER", 400, "customerCode");
    }
    if (!fields.shippingPointId) {
      throw new MdmError("VALIDATION", "shippingPointId is required when ownership is CUSTOMER", 400, "shippingPointId");
    }
    rejectSet(fields.legalEntityId, "legalEntityId", "CUSTOMER");
    rejectSet(fields.vendorId, "vendorId", "CUSTOMER");
    rejectSet(fields.dispatcherPointId, "dispatcherPointId", "CUSTOMER");
    return;
  }
  if (!fields.vendorId) throw new MdmError("VALIDATION", "vendorId is required when ownership is SUPPLIER", 400, "vendorId");
  if (!fields.dispatcherPointId) {
    throw new MdmError("VALIDATION", "dispatcherPointId is required when ownership is SUPPLIER", 400, "dispatcherPointId");
  }
  rejectSet(fields.legalEntityId, "legalEntityId", "SUPPLIER");
  rejectSet(fields.customerCode, "customerCode", "SUPPLIER");
  rejectSet(fields.shippingPointId, "shippingPointId", "SUPPLIER");
}

function rejectSet(value: string | null, field: string, ownership: string) {
  if (value) throw new MdmError("VALIDATION", `${field} must be empty when ownership is ${ownership}`, 400, field);
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

function optionalNumber(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new MdmError("VALIDATION", `${field} must be a number`, 400, field);
  }
  return value;
}

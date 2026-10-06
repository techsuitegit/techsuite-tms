import { MdmError } from "../errors/mdm-error";
import { isCostCentreId } from "./cost-centre-validation";
import { isShippingPointId } from "./shipping-point-validation";
import { isUomId } from "./uom-validation";
import { isDivisionId } from "./division-validation";
import { isMaterialId } from "./material-validation";
import {
  AXLE_CONFIGS,
  CHANGE_REASONS,
  CREATE_FIELDS,
  HAZMAT_CLASSES,
  MASTER_STATUSES,
  UPDATE_FIELDS,
  VEHICLE_CLASSES,
  type CompartmentInput,
  type VehicleInput,
} from "./vehicle-types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9._\-/]{1,40}$/;
const VEHICLE_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Z0-9][A-Z0-9._\-/]{0,39})$/i;

export function isVehicleId(value: string) {
  return VEHICLE_ID_RE.test(value);
}
const COMPARTMENT_FIELDS = ["seq", "materialId", "volume"];

export function parseCreateBody(body: Record<string, unknown>): VehicleInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body, false);
}

export function parseUpdateBody(body: Record<string, unknown>): VehicleInput {
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

function parseFields(body: Record<string, unknown>, requireCode = true): VehicleInput {
  const code = readCode(body, requireCode);
  const plate = requiredString(body, "plate");
  if (plate.length > 40) throw new MdmError("VALIDATION", "plate must be 1-40 characters", 400, "plate");
  const validFrom = requiredDate(body, "validFrom");
  const validTo = optionalDate(body, "validTo");
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }

  return {
    code,
    plate,
    vin: optionalString(body, "vin"),
    make: optionalString(body, "make"),
    model: optionalString(body, "model"),
    modelYear: optionalYear(body, "modelYear"),
    vehicleClass: requiredEnum(body, "vehicleClass", VEHICLE_CLASSES),
    shippingPointId: requiredShippingPointId(body, "shippingPointId"),
    divisionId: requiredDivisionId(body, "divisionId"),
    costCentreId: requiredCostCentreId(body, "costCentreId"),
    capacity: requiredPositiveNumber(body, "capacity"),
    capacityUomId: requiredUomId(body, "capacityUomId"),
    compartments: parseCompartments(body.compartments),
    gvwKg: optionalPositiveNumber(body, "gvwKg"),
    tareKg: optionalPositiveNumber(body, "tareKg"),
    heightM: optionalPositiveNumber(body, "heightM"),
    lengthM: optionalPositiveNumber(body, "lengthM"),
    hazmatClass: optionalEnum(body, "hazmatClass", HAZMAT_CLASSES),
    axleConfig: optionalEnum(body, "axleConfig", AXLE_CONFIGS),
    ptlMinPct: optionalPercent(body, "ptlMinPct"),
    gpsDeviceId: optionalString(body, "gpsDeviceId"),
    insuranceExpiry: optionalDate(body, "insuranceExpiry"),
    fitnessExpiry: optionalDate(body, "fitnessExpiry"),
    permitExpiry: optionalDate(body, "permitExpiry"),
    validFrom,
    validTo,
    reason: requiredEnum(body, "reason", CHANGE_REASONS),
    changeNote: optionalString(body, "changeNote"),
    externalId: optionalString(body, "externalId"),
  };
}

function parseCompartments(value: unknown): CompartmentInput[] {
  let rows = value;
  if (rows == null || rows === "") return [];
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows) as unknown;
    } catch {
      throw new MdmError("VALIDATION", "compartments must be an array", 400, "compartments");
    }
  }
  if (!Array.isArray(rows)) throw new MdmError("VALIDATION", "compartments must be an array", 400, "compartments");

  const seqs = new Set<number>();
  return rows.map((row, index) => {
    const field = `compartments[${index}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new MdmError("VALIDATION", `${field} must be an object`, 400, field);
    }
    const record = row as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!COMPARTMENT_FIELDS.includes(key)) {
        throw new MdmError("VALIDATION", `Unknown field ${field}.${key}`, 400, `${field}.${key}`);
      }
    }
    const seq = record.seq;
    if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 1) {
      throw new MdmError("VALIDATION", `${field}.seq must be a positive integer`, 400, `${field}.seq`);
    }
    if (seqs.has(seq)) throw new MdmError("VALIDATION", `${field}.seq is duplicated`, 400, `${field}.seq`);
    seqs.add(seq);
    return {
      seq,
      materialId: optionalMaterialId(record, "materialId", `${field}.materialId`),
      volume: optionalPositiveNumber(record, "volume", `${field}.volume`),
    };
  });
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

function requiredShippingPointId(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!isShippingPointId(value)) throw new MdmError("VALIDATION", `${field} must be a shipping point id`, 400, field);
  return value;
}

function requiredUomId(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!isUomId(value)) throw new MdmError("VALIDATION", `${field} must be a uom id`, 400, field);
  return value;
}

function requiredUuid(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!UUID_RE.test(value)) throw new MdmError("VALIDATION", `${field} must be a UUID`, 400, field);
  return value;
}

function requiredDivisionId(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!isDivisionId(value)) throw new MdmError("VALIDATION", `${field} must be a division id`, 400, field);
  return value;
}

function requiredCostCentreId(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!isCostCentreId(value)) throw new MdmError("VALIDATION", `${field} must be a cost centre id`, 400, field);
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

function optionalUuid(body: Record<string, unknown>, field: string, label = field) {
  const value = optionalString(body, field);
  if (!value) return null;
  if (!UUID_RE.test(value)) throw new MdmError("VALIDATION", `${label} must be a UUID`, 400, label);
  return value;
}

function optionalMaterialId(body: Record<string, unknown>, field: string, label = field) {
  const value = optionalString(body, field);
  if (!value) return null;
  if (!isMaterialId(value)) throw new MdmError("VALIDATION", `${label} must be a material id`, 400, label);
  return value;
}

function optionalDate(body: Record<string, unknown>, field: string) {
  const value = optionalString(body, field);
  if (!value) return null;
  if (!DATE_RE.test(value)) throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  return value;
}

function optionalPositiveNumber(body: Record<string, unknown>, field: string, label = field) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    throw new MdmError("VALIDATION", `${label} must be a number greater than 0`, 400, label);
  }
  return value;
}

function optionalYear(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1900 || value > 2100) {
    throw new MdmError("VALIDATION", `${field} must be a year from 1900 to 2100`, 400, field);
  }
  return value;
}

function optionalPercent(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 100) {
    throw new MdmError("VALIDATION", `${field} must be a number from 0 to 100`, 400, field);
  }
  return value;
}

import { MdmError } from "../errors/mdm-error";
import { isDivisionId } from "./division-validation";
import { isShippingPointId } from "./shipping-point-validation";
import {
  CHANGE_REASONS,
  COST_CENTRE_TYPES,
  CREATE_FIELDS,
  MASTER_STATUSES,
  UPDATE_FIELDS,
  type CostCentreInput,
} from "./cost-centre-types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9][A-Z0-9._\-/]{0,39}$/;
const COST_CENTRE_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Z0-9][A-Z0-9._\-/]{0,39})$/i;

export function isCostCentreId(value: string) {
  return COST_CENTRE_ID_RE.test(value);
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCreateBody(body: Record<string, unknown>): CostCentreInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body, false);
}

export function parseUpdateBody(body: Record<string, unknown>): CostCentreInput {
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

function parseFields(body: Record<string, unknown>, requireCode = true): CostCentreInput {
  const code = readCode(body, requireCode);
  const validFrom = requiredDate(body, "validFrom");
  const validTo = optionalDate(body, "validTo");
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }
  if (typeof body.active !== "boolean") {
    throw new MdmError("VALIDATION", "active must be true or false", 400, "active");
  }
  return {
    code,
    name: requiredString(body, "name"),
    divisionId: requiredDivisionId(body, "divisionId"),
    shippingPointId: optionalShippingPointId(body, "shippingPointId"),
    type: requiredEnum(body, "type", COST_CENTRE_TYPES),
    budgetOwner: optionalString(body, "budgetOwner"),
    defaultGl: optionalString(body, "defaultGl"),
    annualBudget: optionalMoney(body, "annualBudget"),
    active: body.active,
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

function requiredEnum<T extends string>(body: Record<string, unknown>, field: string, allowed: readonly T[]): T {
  const value = requiredString(body, field);
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

function optionalShippingPointId(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !isShippingPointId(value)) {
    throw new MdmError("VALIDATION", `${field} must be a shipping point id`, 400, field);
  }
  return value;
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

function optionalMoney(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new MdmError("VALIDATION", `${field} must be a non-negative number`, 400, field);
  }
  return Math.round(value * 100) / 100;
}

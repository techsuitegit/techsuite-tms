import { MdmError } from "../errors/mdm-error";
import {
  CHANGE_REASONS,
  CREATE_FIELDS,
  MASTER_STATUSES,
  STANDARD_METHODS,
  UPDATE_FIELDS,
  type DivisionInput,
} from "./division-types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9][A-Z0-9._\-/]{0,39}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+().\-\s]{6,20}$/;
const LANGUAGE_RE = /^[A-Z]{2,8}$/;

function isIanaTimeZone(value: string) {
  try {
    Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function parseCreateBody(body: Record<string, unknown>): DivisionInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body);
}

export function parseUpdateBody(body: Record<string, unknown>): DivisionInput {
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

function parseFields(body: Record<string, unknown>): DivisionInput {
  const code = requiredString(body, "code").toUpperCase();
  if (!CODE_RE.test(code)) {
    throw new MdmError("VALIDATION", "code must be 1-40 letters, digits, or . _ - /", 400, "code");
  }
  const validFrom = requiredDate(body, "validFrom");
  const validTo = optionalDate(body, "validTo");
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }
  const timeZone = requiredString(body, "timeZone");
  if (!isIanaTimeZone(timeZone)) {
    throw new MdmError("VALIDATION", "timeZone must be an IANA name", 400, "timeZone");
  }
  const country = requiredString(body, "country").toUpperCase();
  const language = optionalString(body, "language")?.toUpperCase() ?? null;
  if (language && !LANGUAGE_RE.test(language)) {
    throw new MdmError("VALIDATION", "language must be a short code such as EN", 400, "language");
  }
  const email = optionalString(body, "email");
  if (email && !EMAIL_RE.test(email)) throw new MdmError("VALIDATION", "email is invalid", 400, "email");
  for (const field of ["telephone", "mobile", "fax"] as const) {
    const phone = optionalString(body, field);
    if (phone && !PHONE_RE.test(phone)) throw new MdmError("VALIDATION", `${field} is invalid`, 400, field);
  }

  return {
    code,
    name: requiredString(body, "name"),
    legalEntityId: requiredUuid(body, "legalEntityId"),
    zoneId: requiredUuid(body, "zoneId"),
    searchTerm1: optionalString(body, "searchTerm1"),
    searchTerm2: optionalString(body, "searchTerm2"),
    street: optionalString(body, "street"),
    district: optionalString(body, "district"),
    postalCode: requiredString(body, "postalCode"),
    city: requiredString(body, "city"),
    country,
    region: optionalString(body, "region"),
    timeZone,
    poBox: optionalString(body, "poBox"),
    poBoxPostalCode: optionalString(body, "poBoxPostalCode"),
    companyPostalCode: optionalString(body, "companyPostalCode"),
    language,
    telephone: optionalString(body, "telephone"),
    extension: optionalString(body, "extension"),
    mobile: optionalString(body, "mobile"),
    fax: optionalString(body, "fax"),
    email,
    standardMethod: optionalEnum(body, "standardMethod", STANDARD_METHODS),
    comments: optionalString(body, "comments"),
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

import { MdmError } from "../errors/mdm-error";
import type { CountryInsert, PincodeInsert, StateInsert } from "../repositories/geo.repository";

const COUNTRY_FIELDS = ["id", "name", "shortName", "telephoneCode", "seqNo"] as const;
const STATE_FIELDS = ["countryId", "stateCode", "stateName", "stateShortName"] as const;
const PINCODE_FIELDS = ["countryId", "stateCode", "cityCode", "pincode"] as const;

export function parseCountryBody(body: Record<string, unknown>): CountryInsert {
  rejectUnknown(body, COUNTRY_FIELDS);
  const id = requiredString(body, "id").toUpperCase();
  if (id.length > 5) throw new MdmError("VALIDATION", "id must be at most 5 characters", 400, "id");
  const name = requiredString(body, "name");
  if (name.length > 100) throw new MdmError("VALIDATION", "name must be at most 100 characters", 400, "name");
  const shortName = optionalString(body, "shortName");
  if (shortName && shortName.length > 100) {
    throw new MdmError("VALIDATION", "shortName must be at most 100 characters", 400, "shortName");
  }
  const telephoneCode = optionalString(body, "telephoneCode");
  if (telephoneCode && telephoneCode.length > 200) {
    throw new MdmError("VALIDATION", "telephoneCode must be at most 200 characters", 400, "telephoneCode");
  }
  return { id, name, shortName, telephoneCode, seqNo: optionalInt(body, "seqNo") };
}

export function parseStateBody(body: Record<string, unknown>): StateInsert {
  rejectUnknown(body, STATE_FIELDS);
  const countryId = requiredString(body, "countryId").toUpperCase();
  const stateCode = requiredString(body, "stateCode");
  if (stateCode.length > 5) {
    throw new MdmError("VALIDATION", "stateCode must be at most 5 characters", 400, "stateCode");
  }
  const stateName = requiredString(body, "stateName");
  if (stateName.length > 150) {
    throw new MdmError("VALIDATION", "stateName must be at most 150 characters", 400, "stateName");
  }
  const stateShortName = optionalString(body, "stateShortName");
  if (stateShortName && stateShortName.length > 10) {
    throw new MdmError("VALIDATION", "stateShortName must be at most 10 characters", 400, "stateShortName");
  }
  return { countryId, stateCode, stateName, stateShortName };
}

export function parsePincodeBody(body: Record<string, unknown>): PincodeInsert {
  rejectUnknown(body, PINCODE_FIELDS);
  const countryId = requiredString(body, "countryId").toUpperCase();
  const stateCode = requiredString(body, "stateCode");
  const cityCode = requiredString(body, "cityCode");
  const pincode = requiredString(body, "pincode");
  if (pincode.length > 20) {
    throw new MdmError("VALIDATION", "pincode must be at most 20 characters", 400, "pincode");
  }
  if (countryId === "IND" && !/^\d{6}$/.test(pincode)) {
    throw new MdmError("VALIDATION", "pincode must be 6 digits for India", 400, "pincode");
  }
  return { countryId, stateCode, cityCode, pincode };
}

export function requireCode(value: string | null, field: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new MdmError("VALIDATION", `${field} is required`, 400, field);
  return trimmed;
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

function optionalString(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new MdmError("VALIDATION", `${field} must be text`, 400, field);
  }
  return value.trim() || null;
}

function optionalInt(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new MdmError("VALIDATION", `${field} must be an integer`, 400, field);
  }
  return value;
}

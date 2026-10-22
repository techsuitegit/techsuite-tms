import { MdmError } from "../errors/mdm-error";
import {
  CHANGE_REASONS,
  CREATE_FIELDS,
  DG_CLASSES,
  GEOM_SOURCES,
  MASTER_STATUSES,
  SOURCE_KINDS,
  UPDATE_FIELDS,
  type DgRestrictionInput,
  type DgRestrictionKindRow,
  type GeoJsonPolygon,
} from "./dg-restriction-types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9][A-Z0-9._\-/]{0,39}$/;
const ZONE_ID_RE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Z0-9][A-Z0-9._\-/]{0,39})$/i;

export function isDgRestrictionZoneId(value: string) {
  return ZONE_ID_RE.test(value);
}

export function parseCreateBody(body: Record<string, unknown>): DgRestrictionInput {
  rejectUnknown(body, CREATE_FIELDS);
  return parseFields(body, false);
}

export function parseUpdateBody(body: Record<string, unknown>): DgRestrictionInput {
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

export function validateParamsAgainstKind(params: Record<string, unknown>, kind: DgRestrictionKindRow) {
  for (const key of kind.requiredParams) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      throw new MdmError("PARAM_REQUIRED", `params.${key} is required for kind ${kind.code}`, 400, key);
    }
  }
  for (const [key, value] of Object.entries(params)) {
    const expected = kind.paramTypes[key];
    if (!expected) {
      throw new MdmError("PARAM_UNEXPECTED", `params.${key} is not declared for kind ${kind.code}`, 400, key);
    }
    if (expected === "integer") {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new MdmError("PARAM_TYPE", `params.${key} must be an integer`, 400, key);
      }
    } else if (expected === "number") {
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new MdmError("PARAM_TYPE", `params.${key} must be a number`, 400, key);
      }
    } else if (expected === "string") {
      if (typeof value !== "string" || !value.trim()) {
        throw new MdmError("PARAM_TYPE", `params.${key} must be a string`, 400, key);
      }
      if (key === "tunnelCategory" && !["B", "C", "D", "E"].includes(value)) {
        throw new MdmError("PARAM_TYPE", "params.tunnelCategory must be B–E", 400, key);
      }
    }
  }
}

export function assertPublishableSource(sourceKind: string) {
  if (sourceKind === "ILLUSTRATIVE") {
    throw new MdmError("SOURCE_ILLUSTRATIVE", "ILLUSTRATIVE zones cannot be submitted or published", 400, "sourceKind");
  }
}

function parseFields(body: Record<string, unknown>, requireCode = true): DgRestrictionInput {
  const responseOnly = [
    "publishable",
    "publishBlockReason",
    "areaSqKm",
    "vertexCount",
    "comparatorStatus",
    "resolvedVersionId",
    "geometryPixels",
    "poly",
    "bbox",
    "vehicleId",
  ];
  for (const key of responseOnly) {
    if (key in body) throw new MdmError("VALIDATION", "Unknown field", 400, key);
  }

  const code = readCode(body, requireCode);
  const name = requiredString(body, "name").slice(0, 200);
  const kindCode = requiredString(body, "kindCode").toUpperCase();
  const dgClasses = parseDgClasses(body);
  const geometry = parseGeometry(body.geometry);
  const geomSource = requiredEnum(body, "geomSource", GEOM_SOURCES);
  const windowFromMin = requiredInt(body, "windowFromMin", 0, 1440);
  const windowToMin = requiredInt(body, "windowToMin", 0, 1440);
  if (windowFromMin === windowToMin) {
    throw new MdmError("WINDOW_EMPTY", "windowFromMin and windowToMin cannot be equal", 400, "windowFromMin");
  }
  const params = parseParamsObject(body.params);
  const sourceKind = requiredEnum(body, "sourceKind", SOURCE_KINDS);
  const sourceRef = requiredString(body, "sourceRef");
  if (sourceRef.trim().length < 8) {
    throw new MdmError("SOURCE_REF_TOO_SHORT", "sourceRef must be at least 8 characters", 400, "sourceRef");
  }
  let sourceAuthority = optionalString(body, "sourceAuthority");
  let sourceDated = optionalDate(body, "sourceDated");
  if (sourceKind !== "ILLUSTRATIVE") {
    if (!sourceAuthority) {
      throw new MdmError("SOURCE_AUTHORITY_REQUIRED", "sourceAuthority is required", 400, "sourceAuthority");
    }
    if (!sourceDated) {
      throw new MdmError("SOURCE_DATED_REQUIRED", "sourceDated is required", 400, "sourceDated");
    }
  } else {
    sourceAuthority = sourceAuthority ?? null;
    sourceDated = sourceDated ?? null;
  }
  const reviewDue = requiredDate(body, "reviewDue");
  const validFrom = requiredDate(body, "validFrom");
  if (reviewDue <= validFrom) {
    throw new MdmError("REVIEW_DUE_BEFORE_VALID_FROM", "reviewDue must be later than validFrom", 400, "reviewDue");
  }
  const validTo = optionalDate(body, "validTo");
  if (validTo && validTo < validFrom) {
    throw new MdmError("VALIDATION", "validTo must be on or after validFrom", 400, "validTo");
  }
  const isActive = body.isActive == null ? true : requiredBoolean(body, "isActive");

  return {
    code,
    name,
    kindCode,
    dgClasses,
    geometry,
    geomSource,
    windowFromMin,
    windowToMin,
    params,
    sourceKind,
    sourceRef: sourceRef.trim(),
    sourceAuthority,
    sourceDated,
    sourceUrl: optionalString(body, "sourceUrl"),
    reviewDue,
    notes: optionalString(body, "notes"),
    isActive,
    validFrom,
    validTo,
    reason: requiredEnum(body, "reason", CHANGE_REASONS),
    changeNote: optionalString(body, "changeNote"),
    externalId: optionalString(body, "externalId"),
  };
}

function parseDgClasses(body: Record<string, unknown>): string[] {
  if (!Object.prototype.hasOwnProperty.call(body, "dgClasses")) {
    throw new MdmError("VALIDATION", "dgClasses is required", 400, "dgClasses");
  }
  if (!Array.isArray(body.dgClasses)) {
    throw new MdmError("VALIDATION", "dgClasses must be an array", 400, "dgClasses");
  }
  const out: string[] = [];
  for (const item of body.dgClasses) {
    if (typeof item !== "string" || !item.trim()) {
      throw new MdmError("VALIDATION", "dgClasses members must be strings", 400, "dgClasses");
    }
    const value = item.trim();
    if (!DG_CLASSES.includes(value as (typeof DG_CLASSES)[number])) {
      throw new MdmError("DG_CLASS_UNKNOWN", `Unknown DG class: ${value}`, 400, "dgClasses");
    }
    out.push(value);
  }
  return out;
}

function parseGeometry(raw: unknown): GeoJsonPolygon {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MdmError("GEOMETRY_INVALID", "geometry must be a GeoJSON Polygon", 400, "geometry");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.type !== "Polygon") {
    throw new MdmError("GEOMETRY_INVALID", "geometry.type must be Polygon", 400, "geometry");
  }
  if (!Array.isArray(obj.coordinates) || obj.coordinates.length < 1) {
    throw new MdmError("GEOMETRY_INVALID", "geometry.coordinates is invalid", 400, "geometry");
  }
  const ring = obj.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new MdmError("GEOMETRY_INVALID", "Polygon ring must have at least 4 positions", 400, "geometry");
  }
  for (const pos of ring) {
    if (!Array.isArray(pos) || pos.length < 2 || typeof pos[0] !== "number" || typeof pos[1] !== "number") {
      throw new MdmError("GEOMETRY_INVALID", "Positions must be [lon, lat] numbers", 400, "geometry");
    }
    if (Math.abs(pos[0]) > 180 || Math.abs(pos[1]) > 90) {
      throw new MdmError("GEOMETRY_INVALID", "Coordinates must be WGS-84 lon/lat", 400, "geometry");
    }
  }
  const first = ring[0] as number[];
  const last = ring[ring.length - 1] as number[];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw new MdmError("GEOMETRY_INVALID", "Polygon ring must be closed", 400, "geometry");
  }
  return { type: "Polygon", coordinates: obj.coordinates as number[][][] };
}

function parseParamsObject(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MdmError("VALIDATION", "params must be an object", 400, "params");
  }
  return raw as Record<string, unknown>;
}

function readCode(body: Record<string, unknown>, required: boolean) {
  if (!Object.prototype.hasOwnProperty.call(body, "code") || body.code == null || body.code === "") {
    if (!required) return "";
    throw new MdmError("VALIDATION", "code is required", 400, "code");
  }
  if (typeof body.code !== "string") throw new MdmError("VALIDATION", "code is required", 400, "code");
  const code = body.code.trim().toUpperCase();
  if (!CODE_RE.test(code)) throw new MdmError("VALIDATION", "code is invalid", 400, "code");
  return code;
}

function rejectUnknown(body: Record<string, unknown>, allowed: readonly string[]) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) throw new MdmError("VALIDATION", "Unknown field", 400, key);
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
  if (!Object.prototype.hasOwnProperty.call(body, field) || body[field] == null || body[field] === "") return null;
  if (typeof body[field] !== "string") throw new MdmError("VALIDATION", `${field} is invalid`, 400, field);
  const value = (body[field] as string).trim();
  return value || null;
}

function requiredDate(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field);
  if (!DATE_RE.test(value)) throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  return value;
}

function optionalDate(body: Record<string, unknown>, field: string) {
  const value = optionalString(body, field);
  if (!value) return null;
  if (!DATE_RE.test(value)) throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  return value;
}

function requiredBoolean(body: Record<string, unknown>, field: string) {
  if (typeof body[field] !== "boolean") throw new MdmError("VALIDATION", `${field} is required`, 400, field);
  return body[field] as boolean;
}

function requiredInt(body: Record<string, unknown>, field: string, min: number, max: number) {
  const value = body[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new MdmError("VALIDATION", `${field} must be an integer`, 400, field);
  }
  if (value < min || value > max) {
    throw new MdmError("VALIDATION", `${field} must be between ${min} and ${max}`, 400, field);
  }
  return value;
}

function requiredEnum<T extends string>(body: Record<string, unknown>, field: string, allowed: readonly T[]): T {
  const value = requiredString(body, field);
  if (!allowed.includes(value as T)) throw new MdmError("VALIDATION", `${field} is invalid`, 400, field);
  return value as T;
}

import { MdmError } from "../errors/mdm-error";
import type { OrderInput, OrderMode, OrderStatus } from "./order-types";

const MODES = new Set<OrderMode>(["FORECAST", "MONITOR", "SCHEDULED", "WILL_CALL"]);
const STATUSES = new Set<OrderStatus>(["OPEN", "CANCELLED", "CLOSED"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isOrderId(id: string) {
  return ID_RE.test(id);
}

export function parseStatusFilter(value: string | null) {
  if (!value) return null;
  if (!STATUSES.has(value as OrderStatus)) {
    throw new MdmError("VALIDATION", "status filter is invalid", 400, "status");
  }
  return value as OrderStatus;
}

export function parseCreateBody(body: unknown): OrderInput {
  return parseBody(body, false);
}

export function parseUpdateBody(body: unknown): OrderInput {
  return parseBody(body, true);
}

function parseBody(body: unknown, requireVersion: boolean): OrderInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new MdmError("VALIDATION", "body must be an object", 400);
  }
  const raw = body as Record<string, unknown>;
  const orderNo = requireText(raw.orderNo ?? raw.order_no, "orderNo", 1, 64);
  const customerCode = requireText(raw.customerCode ?? raw.customer_code, "customerCode", 1, 64);
  const materialId = requireText(raw.materialId ?? raw.material_id, "materialId", 1, 64);
  const requestedQtyUomId = requireText(
    raw.requestedQtyUomId ?? raw.requested_qty_uom_id,
    "requestedQtyUomId",
    1,
    64,
  );
  const mode = requireMode(raw.mode);
  const dueDate = requireDate(raw.dueDate ?? raw.due_date, "dueDate");
  const requestedQty = requirePositiveNumber(raw.requestedQty ?? raw.requested_qty, "requestedQty");
  const orderValue = optionalNonNegNumber(raw.orderValue ?? raw.order_value, "orderValue") ?? 0;
  const isPacked = optionalBool(raw.isPacked ?? raw.is_packed, "isPacked") ?? false;
  const storageTankId = optionalText(raw.storageTankId ?? raw.storage_tank_id, "storageTankId", 64);
  const shippingPointId = optionalText(raw.shippingPointId ?? raw.shipping_point_id, "shippingPointId", 64);
  const divisionId = optionalText(raw.divisionId ?? raw.division_id, "divisionId", 64);

  if (!isPacked && !storageTankId) {
    throw new MdmError("VALIDATION", "storageTankId is required when isPacked is false", 400, "storageTankId");
  }
  if (isPacked && storageTankId) {
    throw new MdmError("VALIDATION", "storageTankId must be null when isPacked is true", 400, "storageTankId");
  }

  let versionNo: number | undefined;
  if (requireVersion) {
    versionNo = requireInt(raw.versionNo ?? raw.version_no, "versionNo");
  } else if (raw.versionNo != null || raw.version_no != null) {
    versionNo = requireInt(raw.versionNo ?? raw.version_no, "versionNo");
  }

  return {
    orderNo,
    externalId: optionalText(raw.externalId ?? raw.external_id, "externalId", 128),
    customerCode,
    customerName: optionalText(raw.customerName ?? raw.customer_name, "customerName", 200),
    materialId,
    storageTankId,
    shippingPointId,
    divisionId,
    isPacked,
    mode,
    dueDate,
    requestedQty,
    requestedQtyUomId,
    orderValue,
    notes: optionalText(raw.notes, "notes", 2000),
    versionNo,
  };
}

function requireMode(value: unknown): OrderMode {
  if (typeof value !== "string" || !MODES.has(value as OrderMode)) {
    throw new MdmError("VALIDATION", "mode must be FORECAST, MONITOR, SCHEDULED, or WILL_CALL", 400, "mode");
  }
  return value as OrderMode;
}

function requireText(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "string") throw new MdmError("VALIDATION", `${field} is required`, 400, field);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new MdmError("VALIDATION", `${field} length is invalid`, 400, field);
  }
  return trimmed;
}

function optionalText(value: unknown, field: string, max: number) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new MdmError("VALIDATION", `${field} must be a string`, 400, field);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new MdmError("VALIDATION", `${field} is too long`, 400, field);
  return trimmed;
}

function requireDate(value: unknown, field: string) {
  if (typeof value !== "string" || !DATE_RE.test(value.trim())) {
    throw new MdmError("VALIDATION", `${field} must be YYYY-MM-DD`, 400, field);
  }
  return value.trim();
}

function requirePositiveNumber(value: unknown, field: string) {
  const n = toNumber(value, field);
  if (!(n > 0)) throw new MdmError("VALIDATION", `${field} must be greater than 0`, 400, field);
  return n;
}

function optionalNonNegNumber(value: unknown, field: string) {
  if (value == null || value === "") return null;
  const n = toNumber(value, field);
  if (n < 0) throw new MdmError("VALIDATION", `${field} must be >= 0`, 400, field);
  return n;
}

function toNumber(value: unknown, field: string) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  throw new MdmError("VALIDATION", `${field} must be a number`, 400, field);
}

function optionalBool(value: unknown, field: string) {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
  }
  if (typeof value === "number" && (value === 0 || value === 1)) return value === 1;
  throw new MdmError("VALIDATION", `${field} must be a boolean`, 400, field);
}

function requireInt(value: unknown, field: string) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  throw new MdmError("VALIDATION", `${field} must be an integer`, 400, field);
}

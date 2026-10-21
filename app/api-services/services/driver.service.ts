import { MdmError } from "../errors/mdm-error";
import { mapDbError, type DriverRepository, type DriverRow } from "../repositories/driver.repository";
import { SAFETY_FIELDS, type DispatchBlock, type DriverInput } from "./driver-types";
import { parseCreateBody, parseStatusFilter } from "./driver-validation";
import { indexgenerater } from "./indexgenerater";

const DRIVER_INDEX_CODE = "DRV";

export class DriverService {
  constructor(
    private readonly repo: DriverRepository,
    private readonly index: indexgenerater,
  ) {}

  async list(query: URLSearchParams, canReadPii: boolean) {
    parseStatusFilter(query.get("status"));
    const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") ?? 20) || 20));
    const hazRaw = query.get("hazEndorsed");
    const hazEndorsed = hazRaw == null || hazRaw === "" ? null : hazRaw === "true" ? true : hazRaw === "false" ? false : null;
    if (hazRaw && hazEndorsed == null) {
      throw new MdmError("VALIDATION", "hazEndorsed must be true or false", 400, "hazEndorsed");
    }
    const expiringRaw = query.get("expiringWithinDays");
    const expiringWithinDays =
      expiringRaw == null || expiringRaw === "" ? null : Math.max(0, Number(expiringRaw) || 0);
    const result = await this.repo.list({
      q: query.get("q")?.trim() ?? "",
      status: query.get("status")?.trim() || null,
      homeShippingPointId: query.get("homeShippingPointId")?.trim() || null,
      hazEndorsed,
      expiringWithinDays,
      page,
      pageSize,
      sortKey: query.get("sort")?.trim() || "updatedAt",
    });
    return {
      items: result.rows.map((row) => serializeRow(row, canReadPii)),
      total: result.total,
      page,
    };
  }

  async getById(id: string, canReadPii: boolean) {
    const row = await this.repo.findById(id);
    if (!row) throw new MdmError("NOT_FOUND", "Driver was not found", 404);
    return serializeRow(row, canReadPii);
  }

  async create(input: DriverInput, actor: string) {
    await this.assertParents(input);
    const id = await this.nextDriverId();
    if (!input.code) input.code = id;
    return this.repo.withTransaction(async (client) => {
      const created = await this.repo.insert(client, input, actor, id);
      await this.repo.snapshot(client, created.id, actor);
      await this.repo.audit(client, created.id, "CREATE", actor, input.changeNote ?? null, { status: "DRAFT" });
      return { id: created.id, code: input.code, status: "DRAFT" as const, versionNo: created.versionNo };
    });
  }

  async update(id: string, input: DriverInput, actor: string) {
    await this.assertParents(input);
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status === "PENDING") {
        throw new MdmError("LOCKED", "PENDING Driver cannot be amended", 409);
      }
      if (current.version_no !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      if (current.code !== input.code) {
        throw new MdmError("LOCKED", "code is locked after first save", 409, "code");
      }
      const nextStatus = current.status === "PUBLISHED" || current.status === "REJECTED" ? "DRAFT" : current.status;
      await this.repo.update(client, id, input, actor, nextStatus);
      const updated = await this.repo.lock(client, id);
      await this.repo.snapshot(client, id, actor);
      await this.repo.audit(client, id, "UPDATE", actor, input.changeNote ?? null, {
        versionNo: updated.version_no,
        status: nextStatus,
      });
      return { id, versionNo: updated.version_no, status: nextStatus };
    });
  }

  async submit(id: string, reason: string, actor: string) {
    if (!reason.trim()) throw new MdmError("VALIDATION", "reason is required", 400, "reason");
    const detail = await this.repo.findById(id);
    if (!detail) throw new MdmError("NOT_FOUND", "Driver was not found", 404);
    const safety = await this.requiresSafetyApproval(id, detail as Record<string, unknown>);
    return this.transition(id, actor, reason, (current) => {
      if (current.status !== "DRAFT") throw new MdmError("CONFLICT", "Only DRAFT rows can be submitted", 409);
      return { status: safety ? "PENDING" : "PUBLISHED", action: "SUBMIT" };
    });
  }

  async approve(id: string, note: string | null, actor: string) {
    return this.transition(id, actor, note, (current) => {
      if (current.status !== "PENDING") throw new MdmError("CONFLICT", "Only PENDING rows can be approved", 409);
      return { status: "PUBLISHED", action: "APPROVE" };
    });
  }

  async reject(id: string, note: string, actor: string) {
    if (!note.trim()) throw new MdmError("VALIDATION", "note is required", 400, "note");
    return this.transition(id, actor, note, (current) => {
      if (current.status !== "PENDING") throw new MdmError("CONFLICT", "Only PENDING rows can be rejected", 409);
      return { status: "REJECTED", action: "REJECT" };
    });
  }

  async archive(id: string, reason: string, actor: string) {
    if (!reason.trim()) throw new MdmError("VALIDATION", "reason is required", 400, "reason");
    return this.transition(id, actor, reason, (current) => {
      if (current.status !== "PUBLISHED") throw new MdmError("CONFLICT", "Only PUBLISHED rows can be archived", 409);
      return { status: "ARCHIVED", action: "ARCHIVE" };
    });
  }

  async remove(id: string, actor: string) {
    const vehicles = await this.repo.countPublishedVehiclesWithDefault(id);
    if (vehicles > 0) {
      throw new MdmError(
        "HAS_CHILDREN",
        `Driver is the default on ${vehicles} published vehicle(s)`,
        409,
      );
    }
    return this.repo.withTransaction(async (client) => {
      await this.repo.lock(client, id);
      await this.repo.softDelete(client, id, actor);
      await this.repo.snapshot(client, id, actor);
      await this.repo.audit(client, id, "DELETE", actor, null, { deleted: true });
      return { id, deleted: true };
    });
  }

  async versions(id: string, canReadPii: boolean) {
    await this.getById(id, true);
    const versions = await this.repo.versions(id);
    return {
      versions: versions.map((entry) => ({
        ...entry,
        snapshot: maskSnapshot(entry.snapshot as Record<string, unknown>, canReadPii),
      })),
    };
  }

  async auditLog(id: string, canReadPii: boolean) {
    await this.getById(id, true);
    const events = await this.repo.auditLog(id);
    return {
      events: events.map((event) => ({
        ...event,
        payload: maskSnapshot((event.payload as Record<string, unknown>) ?? {}, canReadPii),
      })),
    };
  }

  async lookups(query: URLSearchParams) {
    const hazRaw = query.get("hazEndorsed");
    const hazEndorsed = hazRaw == null || hazRaw === "" ? null : hazRaw === "true" ? true : hazRaw === "false" ? false : null;
    if (hazRaw && hazEndorsed == null) {
      throw new MdmError("VALIDATION", "hazEndorsed must be true or false", 400, "hazEndorsed");
    }
    return this.repo.lookups({
      q: query.get("q")?.trim() ?? "",
      hazEndorsed,
      homeShippingPointId: query.get("homeShippingPointId")?.trim() || null,
    });
  }

  async dispatchEligibility(id: string, query: URLSearchParams) {
    const row = await this.repo.findById(id);
    if (!row) throw new MdmError("NOT_FOUND", "Driver was not found", 404);
    const onDate = query.get("onDate")?.trim() || todayIso();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(onDate)) {
      throw new MdmError("VALIDATION", "onDate must be YYYY-MM-DD", 400, "onDate");
    }
    const dgClasses = query.getAll("dgClasses").map((item) => item.trim()).filter(Boolean);
    const blocks = evaluateBlocks(row as Record<string, unknown>, onDate, dgClasses);
    return {
      driverId: id,
      onDate,
      eligible: blocks.length === 0,
      blocks,
    };
  }

  async importRows(rows: Record<string, unknown>[], actor: string) {
    const accepted: { id: string; code: string }[] = [];
    const rejected: { row: number; code?: string; message: string; field?: string }[] = [];
    for (const [index, row] of rows.entries()) {
      try {
        const input = parseCreateBody(row);
        const created = await this.create(input, actor);
        accepted.push({ id: created.id, code: input.code });
      } catch (error) {
        const mapped = error instanceof MdmError ? error : mapDbError(error);
        rejected.push({
          row: index + 1,
          code: typeof row.code === "string" ? row.code : undefined,
          message: mapped instanceof Error ? mapped.message : "Unexpected server error",
          field: mapped instanceof MdmError ? mapped.field : undefined,
        });
      }
    }
    return { accepted, rejected };
  }

  async exportCsv(canReadPii: boolean) {
    const rows = await this.repo.exportRows();
    const headers = [
      "code",
      "name",
      "phone",
      "dlNumber",
      "dlValidTo",
      "hazEndorsed",
      "hazEndorsementTo",
      "homeShippingPointId",
      "isActive",
      "validFrom",
      "reason",
      "status",
    ];
    const lines = [headers.join(",")];
    for (const row of rows.map((item) => serializeRow(item, canReadPii))) {
      lines.push(headers.map((key) => csvCell((row as Record<string, unknown>)[key])).join(","));
    }
    return lines.join("\n");
  }

  private async requiresSafetyApproval(id: string, current: Record<string, unknown>) {
    const published = await this.repo.findLastPublishedSafety(id);
    if (!published) return true;
    for (const field of SAFETY_FIELDS) {
      const left = normalizeSafetyValue(published[field] ?? published[toSnake(field)]);
      const right = normalizeSafetyValue(current[field]);
      if (left !== right) return true;
    }
    return false;
  }

  private async transition(
    id: string,
    actor: string,
    note: string | null,
    next: (current: DriverRow) => { status: string; action: string },
  ) {
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      const result = next(current);
      await this.repo.setStatus(client, id, result.status, note, actor);
      await this.repo.lock(client, id);
      await this.repo.snapshot(client, id, actor);
      await this.repo.audit(client, id, result.action, actor, note, { status: result.status });
      return { status: result.status };
    });
  }

  private async nextDriverId() {
    const id = await this.index.getGindexMst(DRIVER_INDEX_CODE);
    await this.index.updateGindexMst(DRIVER_INDEX_CODE);
    return id;
  }

  private async assertParents(input: DriverInput) {
    const shippingPoint = await this.repo.findShippingPointStatus(input.homeShippingPointId);
    if (!shippingPoint) {
      throw new MdmError("PARENT_NOT_FOUND", "Shipping Point was not found", 400, "homeShippingPointId");
    }
    if (shippingPoint.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Shipping Point must be PUBLISHED", 400, "homeShippingPointId");
    }
  }
}

export function evaluateBlocks(
  row: Record<string, unknown>,
  onDate: string,
  dgClasses: string[],
): DispatchBlock[] {
  const blocks: DispatchBlock[] = [];
  const dlValidTo = dateOnly(row.dlValidTo ?? row.dl_valid_to);
  if (typeof dlValidTo === "string" && dlValidTo < onDate) {
    blocks.push({
      code: "DRIVER_DL_EXPIRED",
      kind: "STATUTORY",
      field: "dlValidTo",
      expiredOn: dlValidTo,
      message: `Driving licence lapsed ${formatDisplayDate(dlValidTo)}`,
    });
  }
  if (dgClasses.length > 0) {
    const hazEndorsed = Boolean(row.hazEndorsed ?? row.haz_endorsed);
    if (!hazEndorsed) {
      blocks.push({
        code: "DRIVER_DG_ENDORSEMENT_ABSENT",
        kind: "STATUTORY",
        field: "hazEndorsed",
        message: "Driver is not certified for dangerous goods",
      });
    } else {
      const hazTo = dateOnly(row.hazEndorsementTo ?? row.haz_endorsement_to);
      if (typeof hazTo === "string" && hazTo < onDate) {
        blocks.push({
          code: "DRIVER_DG_ENDORSEMENT_EXPIRED",
          kind: "STATUTORY",
          field: "hazEndorsementTo",
          expiredOn: hazTo,
          message: `DG driver training lapsed ${formatDisplayDate(hazTo)}`,
        });
      }
    }
  }
  return blocks;
}

function serializeRow(row: Record<string, unknown>, canReadPii: boolean) {
  const dlValidTo = dateOnly(row.dlValidTo);
  const hazEndorsementTo = dateOnly(row.hazEndorsementTo);
  const firstLicensedOn = dateOnly(row.firstLicensedOn);
  const onDate = todayIso();
  const hazEndorsed = Boolean(row.hazEndorsed);
  const phone = typeof row.phone === "string" ? row.phone : "";
  const dlNumber = typeof row.dlNumber === "string" ? row.dlNumber : "";
  return {
    ...row,
    phone: canReadPii ? phone : maskTail(phone, 4),
    dlNumber: canReadPii ? dlNumber : maskTail(dlNumber, 4),
    dlValidTo,
    hazEndorsementTo,
    firstLicensedOn,
    validFrom: dateOnly(row.validFrom),
    validTo: dateOnly(row.validTo),
    experienceYears: experienceYears(firstLicensedOn, onDate),
    dlExpired: typeof dlValidTo === "string" ? dlValidTo < onDate : false,
    hazEndorsementExpired: hazEndorsed && typeof hazEndorsementTo === "string" ? hazEndorsementTo < onDate : false,
    dispatchBlocks: evaluateBlocks(row, onDate, []),
  };
}

function maskSnapshot(snapshot: Record<string, unknown>, canReadPii: boolean) {
  if (canReadPii) return snapshot;
  const next = { ...snapshot };
  if (typeof next.phone === "string") next.phone = maskTail(next.phone, 4);
  if (typeof next.dlNumber === "string") next.dlNumber = maskTail(next.dlNumber, 4);
  if (typeof next.dl_number === "string") next.dl_number = maskTail(next.dl_number, 4);
  return next;
}

function experienceYears(firstLicensedOn: unknown, onDate: string) {
  if (typeof firstLicensedOn !== "string") return null;
  const start = new Date(`${firstLicensedOn}T00:00:00Z`);
  const end = new Date(`${onDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  let years = end.getUTCFullYear() - start.getUTCFullYear();
  const beforeAnniversary =
    end.getUTCMonth() < start.getUTCMonth() ||
    (end.getUTCMonth() === start.getUTCMonth() && end.getUTCDate() < start.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

function maskTail(value: string, keep: number) {
  if (!value) return value;
  if (value.length <= keep) return "*".repeat(value.length);
  return `${"*".repeat(value.length - keep)}${value.slice(-keep)}`;
}

function normalizeSafetyValue(value: unknown) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return String(value);
}

function toSnake(value: string) {
  return value.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return value ?? null;
}

function formatDisplayDate(iso: string) {
  const [year, month, day] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthName = months[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthName} ${year}`;
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

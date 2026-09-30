import { MdmError } from "../errors/mdm-error";
import {
  mapDbError,
  type TelemetryDeviceRepository,
  type TelemetryDeviceRow,
} from "../repositories/telemetry-device.repository";
import type { TelemetryDeviceInput } from "./telemetry-device-types";
import { parseCreateBody, parseStatusFilter } from "./telemetry-device-validation";

const VENDOR_TYPES = new Set(["DEVICE", "SUPPLIER"]);

export class TelemetryDeviceService {
  constructor(private readonly repo: TelemetryDeviceRepository) {}

  async list(query: URLSearchParams) {
    parseStatusFilter(query.get("status"));
    const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") ?? 20) || 20));
    const result = await this.repo.list({
      q: query.get("q")?.trim() ?? "",
      status: query.get("status")?.trim() || null,
      page,
      pageSize,
      sortKey: query.get("sort")?.trim() || "updatedAt",
    });
    return { items: result.rows.map(serializeRow), total: result.total, page };
  }

  async getById(id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new MdmError("NOT_FOUND", "Telemetry Device was not found", 404);
    return serializeRow(row);
  }

  async create(input: TelemetryDeviceInput, actor: string) {
    await this.assertParents(input, null);
    return this.repo.withTransaction(async (client) => {
      const row = await this.repo.insert(client, input, actor);
      await this.repo.snapshot(client, row.id, actor);
      await this.repo.audit(client, row.id, "CREATE", actor, input.changeNote ?? null, { status: "DRAFT" });
      return { id: row.id, status: "DRAFT" as const, versionNo: row.versionNo };
    });
  }

  async update(id: string, input: TelemetryDeviceInput, actor: string) {
    await this.assertParents(input, id);
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status === "PENDING") {
        throw new MdmError("LOCKED", "PENDING Telemetry Device cannot be amended", 409);
      }
      if (current.version_no !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      const nextStatus = current.status === "PUBLISHED" ? "PUBLISHED" : current.status;
      await this.repo.update(client, id, input, actor, nextStatus);
      const row = await this.repo.lock(client, id);
      await this.repo.snapshot(client, id, actor);
      await this.repo.audit(client, id, "UPDATE", actor, input.changeNote ?? null, {
        versionNo: row.version_no,
        status: nextStatus,
      });
      return { id, versionNo: row.version_no, status: nextStatus };
    });
  }

  async submit(id: string, reason: string, actor: string) {
    if (!reason.trim()) throw new MdmError("VALIDATION", "reason is required", 400, "reason");
    const current = await this.getById(id);
    await this.assertParents(rowToInput(current), id);
    return this.transition(id, actor, reason, (row) => {
      if (row.status !== "DRAFT") throw new MdmError("CONFLICT", "Only DRAFT rows can be submitted", 409);
      return { status: "PUBLISHED", action: "SUBMIT" };
    });
  }

  async approve(id: string, note: string | null, actor: string) {
    return this.transition(id, actor, note, (row) => {
      if (row.status !== "PENDING") throw new MdmError("CONFLICT", "Only PENDING rows can be approved", 409);
      return { status: "PUBLISHED", action: "APPROVE" };
    });
  }

  async reject(id: string, note: string, actor: string) {
    if (!note.trim()) throw new MdmError("VALIDATION", "note is required", 400, "note");
    return this.transition(id, actor, note, (row) => {
      if (row.status !== "PENDING") throw new MdmError("CONFLICT", "Only PENDING rows can be rejected", 409);
      return { status: "REJECTED", action: "REJECT" };
    });
  }

  async versions(id: string) {
    await this.getById(id);
    return { versions: await this.repo.versions(id) };
  }

  async auditLog(id: string) {
    await this.getById(id);
    return { events: await this.repo.auditLog(id) };
  }

  async lookups() {
    return this.repo.lookups();
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

  async exportCsv() {
    const rows = await this.repo.exportRows();
    const headers = ["code", "vendorId", "imei", "pairingState", "storageTankId", "health", "validFrom", "reason", "status"];
    const lines = [headers.join(",")];
    for (const row of rows.map(serializeRow)) {
      lines.push(headers.map((key) => csvCell((row as Record<string, unknown>)[key])).join(","));
    }
    return lines.join("\n");
  }

  private async transition(
    id: string,
    actor: string,
    note: string | null,
    next: (current: TelemetryDeviceRow) => { status: string; action: string },
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

  private async assertParents(input: TelemetryDeviceInput, exceptId: string | null) {
    const vendor = await this.repo.findVendor(input.vendorId);
    if (!vendor) throw new MdmError("PARENT_NOT_FOUND", "Vendor was not found", 400, "vendorId");
    if (vendor.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Vendor must be PUBLISHED", 400, "vendorId");
    }
    if (!VENDOR_TYPES.has(vendor.type)) {
      throw new MdmError("VALIDATION", "Vendor must be type DEVICE or SUPPLIER", 400, "vendorId");
    }
    if (!input.storageTankId) return;
    const tank = await this.repo.findTankStatus(input.storageTankId);
    if (!tank) throw new MdmError("PARENT_NOT_FOUND", "Storage Tank was not found", 400, "storageTankId");
    if (tank.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Storage Tank must be PUBLISHED", 400, "storageTankId");
    }
    const paired = await this.repo.findPairedTank(input.storageTankId, exceptId);
    if (paired) {
      throw new MdmError("CONFLICT", "Storage Tank is already paired to another device", 409, "storageTankId");
    }
  }
}

function rowToInput(row: Record<string, unknown>): TelemetryDeviceInput {
  return {
    code: String(row.code),
    vendorId: String(row.vendorId),
    model: (row.model as string | null) ?? null,
    imei: (row.imei as string | null) ?? null,
    pairingState: row.pairingState as TelemetryDeviceInput["pairingState"],
    storageTankId: (row.storageTankId as string | null) ?? null,
    cadence: (row.cadence as TelemetryDeviceInput["cadence"]) ?? null,
    health: row.health as TelemetryDeviceInput["health"],
    batteryPct: row.batteryPct == null ? null : Number(row.batteryPct),
    signal: (row.signal as string | null) ?? null,
    validFrom: String(row.validFrom).slice(0, 10),
    validTo: row.validTo ? String(row.validTo).slice(0, 10) : null,
    reason: row.reason as TelemetryDeviceInput["reason"],
    changeNote: (row.changeNote as string | null) ?? null,
    externalId: (row.externalId as string | null) ?? null,
  };
}

function serializeRow(row: Record<string, unknown>) {
  return {
    ...row,
    validFrom: dateOnly(row.validFrom),
    validTo: dateOnly(row.validTo),
  };
}

function dateOnly(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return value ?? null;
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

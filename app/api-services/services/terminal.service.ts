import { MdmError } from "../errors/mdm-error";
import type { GeoRepository } from "../repositories/geo.repository";
import type { TerminalInput } from "./terminal-types";
import { parseCreateBody, parseStatusFilter } from "./terminal-validation";
import { mapDbError, type TerminalRepository, type TerminalRow } from "../repositories/terminal.repository";

export class TerminalService {
  constructor(
    private readonly repo: TerminalRepository,
    private readonly geo: GeoRepository,
  ) {}

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
    return {
      items: result.rows.map(serializeRow),
      total: result.total,
      page,
    };
  }

  async getById(id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new MdmError("NOT_FOUND", "Terminal was not found", 404);
    return serializeRow(row);
  }

  async create(input: TerminalInput, actor: string) {
    await this.assertParents(input);
    return this.repo.withTransaction(async (client) => {
      const row = await this.repo.insert(client, input, actor);
      if (input.isParent) await this.repo.clearOtherParents(client, input.shippingPointId, row.id);
      await this.repo.snapshot(client, row.id, actor);
      await this.repo.audit(client, row.id, "CREATE", actor, input.changeNote ?? null, { status: "DRAFT" });
      return { id: row.id, status: "DRAFT" as const, versionNo: row.versionNo };
    });
  }

  async update(id: string, input: TerminalInput, actor: string) {
    await this.assertParents(input);
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status === "PENDING") {
        throw new MdmError("LOCKED", "PENDING Terminal cannot be amended", 409);
      }
      if (current.version_no !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      const nextStatus = current.status === "PUBLISHED" ? "DRAFT" : current.status;
      await this.repo.update(client, id, input, actor, nextStatus);
      if (input.isParent) await this.repo.clearOtherParents(client, input.shippingPointId, id);
      const updated = await this.repo.lock(client, id);
      await this.repo.snapshot(client, id, actor);
      await this.repo.audit(client, id, "UPDATE", actor, input.changeNote ?? null, { versionNo: updated.version_no });
      return { id, versionNo: updated.version_no };
    });
  }

  async submit(id: string, reason: string, actor: string) {
    if (!reason.trim()) throw new MdmError("VALIDATION", "reason is required", 400, "reason");
    return this.transition(id, actor, reason, (current) => {
      if (current.status !== "DRAFT") throw new MdmError("CONFLICT", "Only DRAFT rows can be submitted", 409);
      return { status: "PENDING", action: "SUBMIT" };
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
    const headers = [
      "id",
      "code",
      "name",
      "ownership",
      "shippingPointId",
      "vendorId",
      "isParent",
      "address",
      "countryId",
      "stateCode",
      "cityCode",
      "pincode",
      "status",
      "validFrom",
      "versionNo",
    ];
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
    next: (current: TerminalRow) => { status: string; action: string },
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

  private async assertParents(input: TerminalInput) {
    const shippingPoint = await this.repo.findShippingPointStatus(input.shippingPointId);
    if (!shippingPoint) throw new MdmError("PARENT_NOT_FOUND", "Shipping Point was not found", 400, "shippingPointId");
    if (shippingPoint.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Shipping Point must be PUBLISHED", 400, "shippingPointId");
    }

    await this.assertGeo(input);

    if (input.ownership !== "THIRD_PARTY" || !input.vendorId) return;
    const vendor = await this.repo.findVendorForSupplier(input.vendorId);
    if (!vendor) throw new MdmError("PARENT_NOT_FOUND", "Vendor was not found", 400, "vendorId");
    if (vendor.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Vendor must be PUBLISHED", 400, "vendorId");
    }
    if (vendor.type !== "SUPPLIER") {
      throw new MdmError("VALIDATION", "Vendor must be type SUPPLIER", 400, "vendorId");
    }
  }

  private async assertGeo(input: TerminalInput) {
    const country = await this.geo.findCountry(input.countryId);
    if (!country) throw new MdmError("PARENT_NOT_FOUND", "Country was not found", 400, "countryId");
    const state = await this.geo.findState(input.countryId, input.stateCode);
    if (!state) throw new MdmError("PARENT_NOT_FOUND", "State was not found", 400, "stateCode");
    const city = await this.geo.findCity(input.countryId, input.stateCode, input.cityCode);
    if (!city) throw new MdmError("PARENT_NOT_FOUND", "City was not found", 400, "cityCode");
  }
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

import { MdmError } from "../errors/mdm-error";
import type { ShippingPointInput } from "./shipping-point-types";
import { parseCreateBody } from "./shipping-point-validation";
import {
  mapDbError,
  type ShippingPointRepository,
  type ShippingPointRow,
} from "../repositories/shipping-point.repository";

export class ShippingPointService {
  constructor(private readonly repo: ShippingPointRepository) {}

  async list(query: URLSearchParams) {
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
    if (!row) throw new MdmError("NOT_FOUND", "Shipping Point was not found", 404);
    return serializeRow(row);
  }

  async create(input: ShippingPointInput, actor: string) {
    await this.assertPublishedDivision(input.divisionId);
    return this.repo.withTransaction(async (client) => {
      const row = await this.repo.insert(client, input, actor);
      await this.repo.snapshot(client, row.id, actor);
      await this.repo.audit(client, row.id, "CREATE", actor, input.changeNote ?? null, { status: "DRAFT" });
      return { id: row.id, status: "DRAFT" as const, versionNo: row.versionNo };
    });
  }

  async update(id: string, input: ShippingPointInput, actor: string) {
    await this.assertPublishedDivision(input.divisionId);
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status === "PENDING") {
        throw new MdmError("LOCKED", "PENDING Shipping Point cannot be amended", 409);
      }
      if (current.version_no !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      const nextStatus = current.status === "PUBLISHED" ? "PUBLISHED" : current.status;
      await this.repo.update(client, id, input, actor, nextStatus);
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
      return { status: "PUBLISHED", action: "SUBMIT" };
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
      "divisionId",
      "type",
      "address",
      "latitude",
      "longitude",
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
    next: (current: ShippingPointRow) => { status: string; action: string },
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

  private async assertPublishedDivision(divisionId: string) {
    const row = await this.repo.findDivisionStatus(divisionId);
    if (!row) throw new MdmError("PARENT_NOT_FOUND", "Division was not found", 400, "divisionId");
    if (row.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Division must be PUBLISHED", 400, "divisionId");
    }
  }
}

function serializeRow(row: Record<string, unknown>) {
  return {
    ...row,
    permitExpiry: dateOnly(row.permitExpiry),
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

import { MdmError } from "../errors/mdm-error";
import { mapDbError, type CylinderRepository, type CylinderRow } from "../repositories/cylinder.repository";
import type { CylinderInput } from "./cylinder-types";
import { isRequalPast, parseCreateBody, parseStatusFilter } from "./cylinder-validation";

export class CylinderService {
  constructor(private readonly repo: CylinderRepository) {}

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
    if (!row) throw new MdmError("NOT_FOUND", "Cylinder was not found", 404);
    return serializeRow(row);
  }

  async create(input: CylinderInput, actor: string) {
    await this.assertParents(input);
    const warnings = requalWarnings(input.requalificationDue);
    const created = await this.repo.withTransaction(async (client) => {
      const row = await this.repo.insert(client, input, actor);
      await this.repo.snapshot(client, row.id, actor);
      await this.repo.audit(client, row.id, "CREATE", actor, input.changeNote ?? null, { status: "DRAFT" });
      return { id: row.id, status: "DRAFT" as const, versionNo: row.versionNo };
    });
    return { ...created, warnings };
  }

  async update(id: string, input: CylinderInput, actor: string) {
    await this.assertParents(input);
    const warnings = requalWarnings(input.requalificationDue);
    const updated = await this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status === "PENDING") {
        throw new MdmError("LOCKED", "PENDING Cylinder cannot be amended", 409);
      }
      if (current.version_no !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      const nextStatus = current.status === "PUBLISHED" || current.status === "REJECTED" ? "DRAFT" : current.status;
      await this.repo.update(client, id, input, actor, nextStatus);
      const row = await this.repo.lock(client, id);
      await this.repo.snapshot(client, id, actor);
      await this.repo.audit(client, id, "UPDATE", actor, input.changeNote ?? null, {
        versionNo: row.version_no,
        status: nextStatus,
      });
      return { id, versionNo: row.version_no, status: nextStatus };
    });
    return { ...updated, warnings };
  }

  async submit(id: string, reason: string, actor: string) {
    if (!reason.trim()) throw new MdmError("VALIDATION", "reason is required", 400, "reason");
    return this.transition(id, actor, reason, (current) => {
      if (current.status !== "DRAFT") throw new MdmError("CONFLICT", "Only DRAFT rows can be submitted", 409);
      const regulatory = current.reason === "Regulatory update" || reason.trim() === "Regulatory update";
      if (isRequalPast(current.requalification_due) && !regulatory) {
        throw new MdmError("REQUAL_EXPIRED", "requalificationDue is in the past", 400, "requalificationDue");
      }
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
      "code",
      "serial",
      "size",
      "materialId",
      "tareKg",
      "fillCapacity",
      "requalificationDue",
      "custodyState",
      "shippingPointId",
      "validFrom",
      "reason",
      "status",
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
    next: (current: CylinderRow) => { status: string; action: string },
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

  private async assertParents(input: CylinderInput) {
    const material = await this.repo.findMaterialStatus(input.materialId);
    if (!material) throw new MdmError("PARENT_NOT_FOUND", "Material was not found", 400, "materialId");
    if (material.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Material must be PUBLISHED", 400, "materialId");
    }
    if (!input.shippingPointId) return;
    const shippingPoint = await this.repo.findShippingPointStatus(input.shippingPointId);
    if (!shippingPoint) {
      throw new MdmError("PARENT_NOT_FOUND", "Shipping Point was not found", 400, "shippingPointId");
    }
    if (shippingPoint.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Shipping Point must be PUBLISHED", 400, "shippingPointId");
    }
  }
}

function requalWarnings(due: string) {
  return isRequalPast(due) ? ["requalificationDue is in the past"] : [];
}

function serializeRow(row: Record<string, unknown>) {
  return {
    ...row,
    validFrom: dateOnly(row.validFrom),
    validTo: dateOnly(row.validTo),
    requalificationDue: dateOnly(row.requalificationDue),
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

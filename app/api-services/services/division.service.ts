import { MdmError } from "../errors/mdm-error";
import { mapDbError, type DivisionRepository, type DivisionRow } from "../repositories/division.repository";
import type { DivisionInput } from "./division-types";
import { parseCreateBody, parseStatusFilter } from "./division-validation";

export class DivisionService {
  constructor(private readonly repo: DivisionRepository) {}

  async list(query: URLSearchParams) {
    const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") ?? 20) || 20));
    const result = await this.repo.list({
      q: query.get("q")?.trim() ?? "",
      status: parseStatusFilter(query.get("status")?.trim() || null),
      page,
      pageSize,
      sortKey: query.get("sort")?.trim() || "updatedAt",
    });
    return { items: result.rows.map(serializeRow), total: result.total, page };
  }

  async getById(id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new MdmError("NOT_FOUND", "Division was not found", 404);
    return serializeRow(row);
  }

  async create(input: DivisionInput, actor: string) {
    await this.assertParents(input);
    return this.repo.withTransaction(async (client) => {
      const created = await this.repo.insert(client, input, actor);
      await this.repo.snapshot(client, created.id, actor);
      await this.repo.audit(client, created.id, "CREATE", actor, input.changeNote ?? null, { status: "DRAFT" });
      return { id: created.id, status: "DRAFT" as const, versionNo: created.versionNo };
    });
  }

  async update(id: string, input: DivisionInput, actor: string) {
    await this.assertParents(input);
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status === "PENDING" || current.status === "ARCHIVED") {
        throw new MdmError("LOCKED", `${current.status} Division cannot be amended`, 409);
      }
      if (current.version_no !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      const nextStatus = current.status === "PUBLISHED" ? "PUBLISHED" : current.status === "REJECTED" ? "DRAFT" : current.status;
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
    const current = await this.getById(id);
    await this.assertParents(rowToParents(current));
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

  async remove(id: string, actor: string) {
    if (await this.repo.hasChildren(id)) {
      throw new MdmError("HAS_CHILDREN", "Division has shipping points or vehicles", 409);
    }
    return this.repo.withTransaction(async (client) => {
      await this.repo.lock(client, id);
      await this.repo.softDelete(client, id, actor);
      await this.repo.snapshot(client, id, actor);
      await this.repo.audit(client, id, "DELETE", actor, null, { deleted: true });
      return { id, deleted: true };
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
    const headers = ["code", "name", "legalEntityId", "zoneId", "city", "country", "timeZone", "validFrom", "reason", "status"];
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
    next: (current: DivisionRow) => { status: string; action: string },
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

  private async assertParents(input: { legalEntityId: string; zoneId: string; country: string }) {
    const country = await this.repo.findCountry(input.country);
    if (!country) throw new MdmError("VALIDATION", "country is not an ISO country", 400, "country");

    const zone = await this.repo.findZone(input.zoneId);
    if (!zone) throw new MdmError("PARENT_NOT_FOUND", "Zone was not found", 400, "zoneId");
    if (zone.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Zone must be PUBLISHED", 400, "zoneId");
    }

    const legalEntity = await this.repo.findLegalEntity(input.legalEntityId);
    if (legalEntity === "missing-table") return;
    if (!legalEntity) throw new MdmError("PARENT_NOT_FOUND", "Legal Entity was not found", 400, "legalEntityId");
    if (legalEntity.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Legal Entity must be PUBLISHED", 400, "legalEntityId");
    }
  }
}

function rowToParents(row: Record<string, unknown>) {
  return {
    legalEntityId: String(row.legalEntityId),
    zoneId: String(row.zoneId),
    country: String(row.country),
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
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return value ?? null;
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

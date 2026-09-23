import { MdmError } from "../errors/mdm-error";
import type { UomInput } from "./uom-types";
import { parseStatusFilter } from "./uom-validation";
import { type UomRepository } from "../repositories/uom.repository";

export class UomService {
  constructor(private readonly repo: UomRepository) {}

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
    return {
      items: result.rows.map(serializeRow),
      total: result.total,
      page,
    };
  }

  async getById(id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new MdmError("NOT_FOUND", "UOM was not found", 404);
    return serializeRow(row);
  }

  async create(input: UomInput, actor: string) {
    return this.repo.withTransaction(async (client) => {
      const created = await this.repo.insert(client, input, actor);
      await this.repo.snapshot(client, created.id, actor);
      await this.repo.audit(client, created.id, "CREATE", actor, input.changeNote ?? null, {
        status: "PUBLISHED",
      });
      return { id: created.id, status: "PUBLISHED" as const, versionNo: created.versionNo };
    });
  }

  async update(id: string, input: UomInput, actor: string) {
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.version_no !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      await this.repo.updatePublished(client, id, input, actor);
      const updated = await this.repo.lock(client, id);
      await this.repo.snapshot(client, id, actor);
      await this.repo.audit(client, id, "UPDATE", actor, input.changeNote ?? null, {
        versionNo: updated.version_no,
        status: "PUBLISHED",
      });
      return { id, status: "PUBLISHED" as const, versionNo: updated.version_no };
    });
  }

  async sapUpsert(input: UomInput, actor: string) {
    return this.repo.withTransaction(async (client) => {
      const existing = await this.repo.findByExternalId(client, input.externalId as string);
      if (!existing) {
        const created = await this.repo.insert(client, input, actor);
        await this.repo.snapshot(client, created.id, actor);
        await this.repo.audit(client, created.id, "SAP_UPSERT", actor, input.changeNote ?? null, {
          status: "PUBLISHED",
          externalId: input.externalId,
        });
        return { id: created.id, externalId: created.externalId, status: "PUBLISHED" as const };
      }

      await this.repo.updatePublished(client, existing.id, { ...input, reason: "Correction" }, actor);
      await this.repo.snapshot(client, existing.id, actor);
      await this.repo.audit(client, existing.id, "SAP_UPSERT", actor, input.changeNote ?? null, {
        status: "PUBLISHED",
        externalId: input.externalId,
      });
      return { id: existing.id, externalId: input.externalId, status: "PUBLISHED" as const };
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

import { MdmError } from "../errors/mdm-error";
import type { VendorInput } from "./vendor-types";
import { parseStatusFilter, parseTypeFilter } from "./vendor-validation";
import { type VendorRepository } from "../repositories/vendor.repository";

export class VendorService {
  constructor(private readonly repo: VendorRepository) {}

  async list(query: URLSearchParams) {
    const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") ?? 20) || 20));
    const result = await this.repo.list({
      q: query.get("q")?.trim() ?? "",
      status: parseStatusFilter(query.get("status")?.trim() || null),
      type: parseTypeFilter(query.get("type")?.trim() || null),
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
    if (!row) throw new MdmError("NOT_FOUND", "Vendor was not found", 404);
    return serializeRow(row);
  }

  async sapUpsert(input: VendorInput, actor: string) {
    return this.repo.withTransaction(async (client) => {
      const existing = await this.repo.findByExternalId(client, input.externalId);
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

  async lookups(type: string | null) {
    return this.repo.lookups(parseTypeFilter(type));
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

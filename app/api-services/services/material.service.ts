import { MdmError } from "../errors/mdm-error";
import type { MaterialInput } from "./material-types";
import { parseStatusFilter } from "./material-validation";
import { type MaterialRepository, type MaterialRow } from "../repositories/material.repository";
import type { UomRepository } from "../repositories/uom.repository";

export class MaterialService {
  constructor(
    private readonly repo: MaterialRepository,
    private readonly uom: UomRepository,
  ) {}

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
    if (!row) throw new MdmError("NOT_FOUND", "Material was not found", 404);
    return serializeRow(row);
  }

  async create(input: MaterialInput, actor: string) {
    await this.assertUoms(input);
    return this.repo.withTransaction(async (client) => {
      const created = await this.repo.insert(client, input, actor, "DRAFT");
      await this.repo.snapshot(client, created.id, actor);
      await this.repo.audit(client, created.id, "CREATE", actor, input.changeNote ?? null, { status: "DRAFT" });
      return { id: created.id, status: "DRAFT" as const, versionNo: created.versionNo };
    });
  }

  async update(id: string, input: MaterialInput, actor: string) {
    await this.assertUoms(input);
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status === "PENDING") {
        throw new MdmError("LOCKED", "PENDING Material cannot be amended", 409);
      }
      if (current.version_no !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      if (current.code !== input.code) {
        throw new MdmError("LOCKED", "code is locked after first save", 409, "code");
      }
      const nextStatus = nextAmendStatus(current, input);
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

  async sapUpsert(input: MaterialInput, actor: string) {
    await this.assertUoms(input);
    return this.repo.withTransaction(async (client) => {
      const existing = await this.repo.findByExternalId(client, input.externalId as string);
      if (!existing) {
        const created = await this.repo.insert(client, input, actor, "PUBLISHED");
        await this.repo.snapshot(client, created.id, actor);
        await this.repo.audit(client, created.id, "SAP_UPSERT", actor, input.changeNote ?? null, {
          status: "PUBLISHED",
          externalId: input.externalId,
        });
        return { id: created.id, externalId: created.externalId, status: "PUBLISHED" as const };
      }

      await this.repo.update(client, existing.id, { ...input, reason: "Correction" }, actor, "PUBLISHED");
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

  private async transition(
    id: string,
    actor: string,
    note: string | null,
    next: (current: MaterialRow) => { status: string; action: string },
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

  private async assertUoms(input: MaterialInput) {
    await this.assertPublishedUom(input.baseUomId, "baseUomId");
    if (input.altUomId) await this.assertPublishedUom(input.altUomId, "altUomId");
    if (input.weightUomId) await this.assertPublishedUom(input.weightUomId, "weightUomId", "MASS");
    if (input.volumeUomId) await this.assertPublishedUom(input.volumeUomId, "volumeUomId", "VOLUME");
  }

  private async assertPublishedUom(id: string, field: string, dimension?: "MASS" | "VOLUME") {
    const uom = await this.uom.findById(id);
    if (!uom) throw new MdmError("PARENT_NOT_FOUND", "UOM was not found", 400, field);
    if (uom.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "UOM must be PUBLISHED", 400, field);
    }
    if (dimension && uom.dimension !== dimension) {
      throw new MdmError("VALIDATION", `UOM dimension must be ${dimension}`, 400, field);
    }
  }
}

function nextAmendStatus(current: MaterialRow, input: MaterialInput) {
  if (current.status !== "PUBLISHED") return current.status === "REJECTED" ? "DRAFT" : current.status;
  if (isFinancialChange(current, input)) return "PENDING";
  return "DRAFT";
}

function isFinancialChange(current: MaterialRow, input: MaterialInput) {
  return (
    current.base_uom_id !== input.baseUomId ||
    (current.dg_profile ?? null) !== (input.dgProfile ?? null) ||
    (current.un_number ?? null) !== (input.unNumber ?? null) ||
    (current.alt_uom_id ?? null) !== (input.altUomId ?? null) ||
    (current.weight_uom_id ?? null) !== (input.weightUomId ?? null) ||
    (current.volume_uom_id ?? null) !== (input.volumeUomId ?? null)
  );
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

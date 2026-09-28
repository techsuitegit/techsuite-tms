import { MdmError } from "../errors/mdm-error";
import type { StorageTankInput } from "./storage-tank-types";
import { parseStatusFilter } from "./storage-tank-validation";
import { type StorageTankRepository, type StorageTankRow } from "../repositories/storage-tank.repository";

export class StorageTankService {
  constructor(private readonly repo: StorageTankRepository) {}

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
    if (!row) throw new MdmError("NOT_FOUND", "Storage Tank was not found", 404);
    return serializeRow(row);
  }

  async create(input: StorageTankInput, actor: string) {
    await this.assertParents(input);
    return this.repo.withTransaction(async (client) => {
      const created = await this.repo.insert(client, input, actor);
      await this.repo.snapshot(client, created.id, actor);
      await this.repo.audit(client, created.id, "CREATE", actor, input.changeNote ?? null, { status: "DRAFT" });
      return { id: created.id, status: "DRAFT" as const, versionNo: created.versionNo };
    });
  }

  async update(id: string, input: StorageTankInput, actor: string) {
    await this.assertParents(input);
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status === "PENDING") {
        throw new MdmError("LOCKED", "PENDING Storage Tank cannot be amended", 409);
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

  private async transition(
    id: string,
    actor: string,
    note: string | null,
    next: (current: StorageTankRow) => { status: string; action: string },
  ) {
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      const result = next(current);
      await this.repo.setStatus(client, id, result.status, note, actor);
      await this.repo.snapshot(client, id, actor);
      await this.repo.audit(client, id, result.action, actor, note, { status: result.status });
      return { status: result.status };
    });
  }

  private async assertParents(input: StorageTankInput) {
    const material = await this.repo.findPublished("material", input.materialId);
    if (!material) throw new MdmError("PARENT_NOT_FOUND", "Material was not found", 400, "materialId");
    if (material.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Material must be PUBLISHED", 400, "materialId");
    }
    if (input.shippingPointId) await this.assertShippingPoint(input.shippingPointId, "shippingPointId");
    if (input.dispatcherPointId) await this.assertShippingPoint(input.dispatcherPointId, "dispatcherPointId");
    if (input.vendorId) {
      const vendor = await this.repo.findVendor(input.vendorId);
      if (!vendor) throw new MdmError("PARENT_NOT_FOUND", "Vendor was not found", 400, "vendorId");
      if (vendor.status !== "PUBLISHED") throw new MdmError("PARENT_NOT_PUBLISHED", "Vendor must be PUBLISHED", 400, "vendorId");
      if (vendor.type !== "SUPPLIER") throw new MdmError("VALIDATION", "Vendor must be type SUPPLIER", 400, "vendorId");
    }
    if (input.capacityUomId) {
      const uom = await this.repo.findPublishedUom(input.capacityUomId);
      if (!uom) throw new MdmError("PARENT_NOT_FOUND", "UOM was not found", 400, "capacityUomId");
      if (uom.status !== "PUBLISHED") throw new MdmError("PARENT_NOT_PUBLISHED", "UOM must be PUBLISHED", 400, "capacityUomId");
    }
  }

  private async assertShippingPoint(id: string, field: string) {
    const row = await this.repo.findPublished("shipping_point", id);
    if (!row) throw new MdmError("PARENT_NOT_FOUND", "Shipping Point was not found", 400, field);
    if (row.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Shipping Point must be PUBLISHED", 400, field);
    }
  }
}

function serializeRow(row: Record<string, unknown>) {
  return {
    ...row,
    validFrom: dateOnly(row.validFrom),
    validTo: dateOnly(row.validTo),
    lastCalibration: dateOnly(row.lastCalibration),
    inspectionDue: dateOnly(row.inspectionDue),
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

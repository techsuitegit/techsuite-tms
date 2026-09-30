import { MdmError } from "../errors/mdm-error";
import { mapDbError, type VehicleRepository, type VehicleRow } from "../repositories/vehicle.repository";
import type { VehicleInput } from "./vehicle-types";
import { parseCreateBody, parseStatusFilter } from "./vehicle-validation";

export class VehicleService {
  constructor(private readonly repo: VehicleRepository) {}

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
    if (!row) throw new MdmError("NOT_FOUND", "Vehicle was not found", 404);
    return serializeRow(row);
  }

  async create(input: VehicleInput, actor: string) {
    await this.assertParents(input);
    const warnings = capacityWarnings(input);
    const created = await this.repo.withTransaction(async (client) => {
      const row = await this.repo.insert(client, input, actor);
      await this.repo.snapshot(client, row.id, actor);
      await this.repo.audit(client, row.id, "CREATE", actor, input.changeNote ?? null, { status: "DRAFT" });
      return { id: row.id, status: "DRAFT" as const, versionNo: row.versionNo };
    });
    return { ...created, warnings };
  }

  async update(id: string, input: VehicleInput, actor: string) {
    await this.assertParents(input);
    const warnings = capacityWarnings(input);
    const updated = await this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status === "PENDING") {
        throw new MdmError("LOCKED", "PENDING Vehicle cannot be amended", 409);
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
      "plate",
      "vehicleClass",
      "shippingPointId",
      "divisionId",
      "costCentreId",
      "capacity",
      "capacityUomId",
      "hazmatClass",
      "validFrom",
      "reason",
      "status",
      "compartments",
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
    next: (current: VehicleRow) => { status: string; action: string },
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

  private async assertParents(input: VehicleInput) {
    const shippingPoint = await this.repo.findShippingPoint(input.shippingPointId);
    if (!shippingPoint) {
      throw new MdmError("PARENT_NOT_FOUND", "Shipping Point was not found", 400, "shippingPointId");
    }
    if (shippingPoint.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Shipping Point must be PUBLISHED", 400, "shippingPointId");
    }
    if (input.divisionId !== shippingPoint.divisionId) {
      throw new MdmError("VALIDATION", "divisionId must match the Shipping Point division", 400, "divisionId");
    }

    const division = await this.repo.findDivisionStatus(input.divisionId);
    if (!division) throw new MdmError("PARENT_NOT_FOUND", "Division was not found", 400, "divisionId");
    if (division.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Division must be PUBLISHED", 400, "divisionId");
    }

    const uom = await this.repo.findUomStatus(input.capacityUomId);
    if (!uom) throw new MdmError("PARENT_NOT_FOUND", "UOM was not found", 400, "capacityUomId");
    if (uom.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "UOM must be PUBLISHED", 400, "capacityUomId");
    }

    for (const [index, compartment] of input.compartments.entries()) {
      if (!compartment.materialId) continue;
      const material = await this.repo.findMaterialStatus(compartment.materialId);
      const field = `compartments[${index}].materialId`;
      if (!material) throw new MdmError("PARENT_NOT_FOUND", "Material was not found", 400, field);
      if (material.status !== "PUBLISHED") {
        throw new MdmError("PARENT_NOT_PUBLISHED", "Material must be PUBLISHED", 400, field);
      }
    }
  }
}

function capacityWarnings(input: VehicleInput) {
  const sum = input.compartments.reduce((total, row) => total + (row.volume ?? 0), 0);
  if (sum > input.capacity) {
    return ["Sum of compartment volumes is greater than capacity"];
  }
  return [];
}

function serializeRow(row: Record<string, unknown>) {
  return {
    ...row,
    validFrom: dateOnly(row.validFrom),
    validTo: dateOnly(row.validTo),
    insuranceExpiry: dateOnly(row.insuranceExpiry),
    fitnessExpiry: dateOnly(row.fitnessExpiry),
    permitExpiry: dateOnly(row.permitExpiry),
    compartments: Array.isArray(row.compartments) ? row.compartments : row.compartments ?? undefined,
  };
}

function dateOnly(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return value ?? null;
}

function csvCell(value: unknown) {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

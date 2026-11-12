import { MdmError } from "../errors/mdm-error";
import { mapDbError, type OrderRepository } from "../repositories/order.repository";
import type { OrderInput } from "./order-types";
import { isOrderId, parseCreateBody, parseStatusFilter, parseUpdateBody } from "./order-validation";
import { indexgenerater } from "./indexgenerater";

const ORDER_INDEX_CODE = "ORD";

export class OrderService {
  constructor(
    private readonly repo: OrderRepository,
    private readonly index: indexgenerater,
  ) {}

  async list(query: URLSearchParams) {
    parseStatusFilter(query.get("status"));
    const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") ?? 20) || 20));
    const result = await this.repo.list({
      q: query.get("q")?.trim() ?? "",
      status: query.get("status")?.trim() || null,
      qualOutcome: query.get("qualOutcome")?.trim() || null,
      mode: query.get("mode")?.trim() || null,
      dueFrom: query.get("dueFrom")?.trim() || null,
      dueTo: query.get("dueTo")?.trim() || null,
      page,
      pageSize,
      sortKey: query.get("sort")?.trim() || "updatedAt",
    });
    return { items: result.rows.map(serializeRow), total: result.total, page };
  }

  async getById(id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new MdmError("NOT_FOUND", "Order was not found", 404);
    return serializeRow(row);
  }

  async create(input: OrderInput, actor: string) {
    await this.assertParents(input);
    const id = await this.nextOrderId();
    if (!input.orderNo) input.orderNo = id;
    return this.repo.withTransaction(async (client) => {
      const row = await this.repo.insert(client, input, actor, id);
      await this.repo.snapshot(client, row.id, actor);
      await this.repo.audit(client, row.id, "CREATE", actor, null, {
        status: "OPEN",
        orderNo: input.orderNo,
        externalId: input.externalId,
      });
      return { id: row.id, orderNo: input.orderNo, status: "OPEN" as const, versionNo: row.versionNo };
    });
  }

  async update(id: string, input: OrderInput, actor: string) {
    await this.assertParents(input);
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status !== "OPEN") {
        throw new MdmError("LOCKED", "Only OPEN orders can be amended", 409);
      }
      if (current.qual_outcome !== "PENDING") {
        throw new MdmError("LOCKED", "Qualified orders cannot be amended here; use M02 override later", 409);
      }
      if (input.versionNo == null || current.version_no !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      await this.repo.update(client, id, input, actor);
      const row = await this.repo.lock(client, id);
      await this.repo.snapshot(client, id, actor);
      await this.repo.audit(client, id, "UPDATE", actor, null, {
        versionNo: row.version_no,
        status: row.status,
      });
      return { id, versionNo: row.version_no, status: row.status };
    });
  }

  async cancel(id: string, reason: string, actor: string) {
    if (!reason.trim()) throw new MdmError("VALIDATION", "reason is required", 400, "reason");
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status !== "OPEN") {
        throw new MdmError("CONFLICT", "Only OPEN orders can be cancelled", 409);
      }
      await this.repo.setStatus(client, id, "CANCELLED", actor);
      const row = await this.repo.lock(client, id);
      await this.repo.snapshot(client, id, actor);
      await this.repo.audit(client, id, "CANCEL", actor, reason.trim(), { status: "CANCELLED" });
      return { id, versionNo: row.version_no, status: "CANCELLED" as const };
    });
  }

  async softDelete(id: string, actor: string) {
    return this.repo.withTransaction(async (client) => {
      await this.repo.lock(client, id);
      await this.repo.softDelete(client, id, actor);
      await this.repo.audit(client, id, "DELETE", actor, null, null);
      return { id, deleted: true as const };
    });
  }

  async versions(id: string) {
    await this.getById(id);
    return this.repo.versions(id);
  }

  async auditLog(id: string) {
    await this.getById(id);
    return this.repo.auditLog(id);
  }

  async lookups() {
    return this.repo.lookups();
  }

  /**
   * CSV/JSON row import. Accepts materialId or materialCode, uomId or uomCode, etc.
   * Upserts by externalId when present; otherwise creates. Row-level reject list.
   */
  async importRows(rows: Record<string, unknown>[], actor: string) {
    const accepted: { id: string; orderNo: string; action: "CREATE" | "UPDATE" }[] = [];
    const rejected: { row: number; orderNo?: string; message: string; field?: string }[] = [];

    for (const [index, row] of rows.entries()) {
      try {
        const normalized = await this.resolveImportCodes(row);
        const input = parseCreateBody(normalized);
        const existing =
          (input.externalId ? await this.repo.findByExternalId(input.externalId) : null) ??
          (await this.repo.findByOrderNo(input.orderNo));

        if (existing) {
          const updateInput = parseUpdateBody({ ...normalized, versionNo: existing.versionNo });
          const updated = await this.update(existing.id as string, updateInput, actor);
          accepted.push({ id: updated.id, orderNo: input.orderNo, action: "UPDATE" });
        } else {
          const created = await this.create(input, actor);
          accepted.push({ id: created.id, orderNo: input.orderNo, action: "CREATE" });
        }
      } catch (error) {
        const mapped = error instanceof MdmError ? error : mapDbError(error);
        rejected.push({
          row: index + 1,
          orderNo: typeof row.orderNo === "string" ? row.orderNo : typeof row.order_no === "string" ? row.order_no : undefined,
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
      "orderNo",
      "externalId",
      "customerCode",
      "customerName",
      "materialId",
      "materialCode",
      "storageTankId",
      "shippingPointId",
      "divisionId",
      "isPacked",
      "mode",
      "dueDate",
      "requestedQty",
      "requestedQtyUomId",
      "orderValue",
      "status",
      "qualOutcome",
      "notes",
    ];
    const lines = [headers.join(",")];
    for (const row of rows.map(serializeRow)) {
      lines.push(headers.map((key) => csvCell((row as Record<string, unknown>)[key])).join(","));
    }
    return lines.join("\n");
  }

  private async resolveImportCodes(row: Record<string, unknown>): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = { ...row };

    if (!out.materialId && !out.material_id && (out.materialCode || out.material_code)) {
      const code = String(out.materialCode ?? out.material_code);
      const mat = await this.repo.findPublishedByCode("material", code);
      if (!mat) throw new MdmError("VALIDATION", `materialCode ${code} not found or not PUBLISHED`, 400, "materialCode");
      out.materialId = mat.id;
    }
    if (!out.requestedQtyUomId && !out.requested_qty_uom_id && (out.uomCode || out.uom_code || out.requestedQtyUomCode)) {
      const code = String(out.uomCode ?? out.uom_code ?? out.requestedQtyUomCode);
      const uom = await this.repo.findPublishedByCode("uom", code);
      if (!uom) throw new MdmError("VALIDATION", `uomCode ${code} not found or not PUBLISHED`, 400, "uomCode");
      out.requestedQtyUomId = uom.id;
    }
    if (!out.storageTankId && !out.storage_tank_id && (out.storageTankCode || out.storage_tank_code)) {
      const code = String(out.storageTankCode ?? out.storage_tank_code);
      const tank = await this.repo.findPublishedByCode("storage_tank", code);
      if (!tank) throw new MdmError("VALIDATION", `storageTankCode ${code} not found or not PUBLISHED`, 400, "storageTankCode");
      out.storageTankId = tank.id;
    }
    if (!out.shippingPointId && !out.shipping_point_id && (out.shippingPointCode || out.shipping_point_code)) {
      const code = String(out.shippingPointCode ?? out.shipping_point_code);
      const sp = await this.repo.findPublishedByCode("shipping_point", code);
      if (!sp) throw new MdmError("VALIDATION", `shippingPointCode ${code} not found or not PUBLISHED`, 400, "shippingPointCode");
      out.shippingPointId = sp.id;
    }
    if (!out.divisionId && !out.division_id && (out.divisionCode || out.division_code)) {
      const code = String(out.divisionCode ?? out.division_code);
      const div = await this.repo.findPublishedByCode("division", code);
      if (!div) throw new MdmError("VALIDATION", `divisionCode ${code} not found or not PUBLISHED`, 400, "divisionCode");
      out.divisionId = div.id;
    }
    return out;
  }

  private async assertParents(input: OrderInput) {
    const material = await this.repo.findPublishedParent("material", input.materialId);
    if (!material) throw new MdmError("VALIDATION", "materialId was not found", 400, "materialId");
    if (material.status !== "PUBLISHED") {
      throw new MdmError("VALIDATION", "materialId must be PUBLISHED", 400, "materialId");
    }

    const uom = await this.repo.findPublishedParent("uom", input.requestedQtyUomId);
    if (!uom) throw new MdmError("VALIDATION", "requestedQtyUomId was not found", 400, "requestedQtyUomId");
    if (uom.status !== "PUBLISHED") {
      throw new MdmError("VALIDATION", "requestedQtyUomId must be PUBLISHED", 400, "requestedQtyUomId");
    }

    if (input.storageTankId) {
      const tank = await this.repo.findPublishedParent("storage_tank", input.storageTankId);
      if (!tank) throw new MdmError("VALIDATION", "storageTankId was not found", 400, "storageTankId");
      if (tank.status !== "PUBLISHED") {
        throw new MdmError("VALIDATION", "storageTankId must be PUBLISHED", 400, "storageTankId");
      }
    }
    if (input.shippingPointId) {
      const sp = await this.repo.findPublishedParent("shipping_point", input.shippingPointId);
      if (!sp) throw new MdmError("VALIDATION", "shippingPointId was not found", 400, "shippingPointId");
      if (sp.status !== "PUBLISHED") {
        throw new MdmError("VALIDATION", "shippingPointId must be PUBLISHED", 400, "shippingPointId");
      }
    }
    if (input.divisionId) {
      const div = await this.repo.findPublishedParent("division", input.divisionId);
      if (!div) throw new MdmError("VALIDATION", "divisionId was not found", 400, "divisionId");
      if (div.status !== "PUBLISHED") {
        throw new MdmError("VALIDATION", "divisionId must be PUBLISHED", 400, "divisionId");
      }
    }
  }

  private async nextOrderId() {
    const id = await this.index.getGindexMst(ORDER_INDEX_CODE);
    await this.index.updateGindexMst(ORDER_INDEX_CODE);
    if (!isOrderId(id)) throw new MdmError("CONFLICT", "generated order id is invalid", 409);
    return id;
  }
}

function serializeRow(row: Record<string, unknown>) {
  return row;
}

function csvCell(value: unknown) {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

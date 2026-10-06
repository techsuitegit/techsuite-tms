import { MdmError } from "../errors/mdm-error";
import {
  mapDbError,
  type CostCentreLocked,
  type CostCentreRepository,
} from "../repositories/cost-centre.repository";
import type { CostCentreInput } from "./cost-centre-types";
import { parseCreateBody, parseStatusFilter } from "./cost-centre-validation";
import { indexgenerater } from "./indexgenerater";

const COST_CENTRE_INDEX_CODE = "CCT";

export class CostCentreService {
  constructor(
    private readonly repo: CostCentreRepository,
    private readonly index: indexgenerater,
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
    return { items: result.rows.map(serializeRow), total: result.total, page };
  }

  async getById(id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new MdmError("NOT_FOUND", "Cost Centre was not found", 404);
    return serializeRow(row);
  }

  async create(input: CostCentreInput, actor: string) {
    await this.assertParents(input);
    const id = await this.nextCostCentreId();
    if (!input.code) input.code = id;
    return this.repo.withTransaction(async (client) => {
      const created = await this.repo.insert(client, input, actor, id);
      await this.repo.snapshot(client, created.id, actor);
      await this.repo.audit(client, created.id, "CREATE", actor, input.changeNote ?? null, { status: "DRAFT" });
      return { id: created.id, code: input.code, status: "DRAFT" as const, versionNo: created.versionNo };
    });
  }

  async update(id: string, input: CostCentreInput, actor: string) {
    await this.assertParents(input);
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status === "PENDING" || current.status === "ARCHIVED") {
        throw new MdmError("LOCKED", `${current.status} Cost Centre cannot be amended`, 409);
      }
      if (current.version_no !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
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
    const current = await this.getById(id);
    const input = rowToInput(current);
    await this.assertParents(input);
    const financial = hasFinancial(input.annualBudget, input.defaultGl);
    return this.transition(id, actor, reason, (row) => {
      if (row.status !== "DRAFT") throw new MdmError("CONFLICT", "Only DRAFT rows can be submitted", 409);
      return { status: financial ? "PENDING" : "PUBLISHED", action: "SUBMIT" };
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
    const headers = ["code", "name", "divisionId", "shippingPointId", "type", "defaultGl", "annualBudget", "active", "validFrom", "reason", "status"];
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
    next: (current: CostCentreLocked) => { status: string; action: string },
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

  private async nextCostCentreId() {
    const id = await this.index.getGindexMst(COST_CENTRE_INDEX_CODE);
    await this.index.updateGindexMst(COST_CENTRE_INDEX_CODE);
    return id;
  }

  private async assertParents(input: CostCentreInput) {
    const division = await this.repo.findDivision(input.divisionId);
    if (!division) throw new MdmError("PARENT_NOT_FOUND", "Division was not found", 400, "divisionId");
    if (division.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Division must be PUBLISHED", 400, "divisionId");
    }
    if (!input.shippingPointId) return;
    const shippingPoint = await this.repo.findShippingPoint(input.shippingPointId);
    if (!shippingPoint) throw new MdmError("PARENT_NOT_FOUND", "Shipping Point was not found", 400, "shippingPointId");
    if (shippingPoint.status !== "PUBLISHED") {
      throw new MdmError("PARENT_NOT_PUBLISHED", "Shipping Point must be PUBLISHED", 400, "shippingPointId");
    }
    if (shippingPoint.divisionId !== input.divisionId) {
      throw new MdmError("VALIDATION", "Shipping Point must belong to the same division", 400, "shippingPointId");
    }
  }
}

function nextAmendStatus(current: CostCentreLocked, input: CostCentreInput) {
  if (current.status === "PUBLISHED") {
    return moneyChanged(current, input) ? "PENDING" : "PUBLISHED";
  }
  if (current.status === "REJECTED") return "DRAFT";
  return current.status;
}

function moneyChanged(current: CostCentreLocked, input: CostCentreInput) {
  return !sameBudget(current.annual_budget, input.annualBudget) || (current.default_gl ?? null) !== (input.defaultGl ?? null);
}

function sameBudget(current: string | null, next: number | null) {
  if (current == null && next == null) return true;
  if (current == null || next == null) return false;
  return Number(current).toFixed(2) === next.toFixed(2);
}

function hasFinancial(annualBudget: unknown, defaultGl: unknown) {
  return annualBudget != null || (typeof defaultGl === "string" && defaultGl.trim() !== "");
}

function rowToInput(row: Record<string, unknown>): CostCentreInput {
  return {
    code: String(row.code),
    name: String(row.name),
    divisionId: String(row.divisionId),
    shippingPointId: (row.shippingPointId as string | null) ?? null,
    type: row.type as CostCentreInput["type"],
    budgetOwner: (row.budgetOwner as string | null) ?? null,
    defaultGl: (row.defaultGl as string | null) ?? null,
    annualBudget: row.annualBudget == null ? null : Number(row.annualBudget),
    active: Boolean(row.active),
    validFrom: String(row.validFrom).slice(0, 10),
    validTo: row.validTo ? String(row.validTo).slice(0, 10) : null,
    reason: row.reason as CostCentreInput["reason"],
    changeNote: (row.changeNote as string | null) ?? null,
    externalId: (row.externalId as string | null) ?? null,
  };
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    annualBudget: row.annualBudget == null ? null : Number(row.annualBudget),
    validFrom: dateOnly(row.validFrom),
    validTo: dateOnly(row.validTo),
  };
}

function dateOnly(value: unknown): string | null {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return null;
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

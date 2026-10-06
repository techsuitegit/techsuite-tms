import { MdmError } from "../errors/mdm-error";
import { mapDbError, type HaulierRepository, type HaulierRow } from "../repositories/haulier.repository";
import type { HaulierInput } from "./haulier-types";
import { isExpiring, parseCreateBody, parseStatusFilter } from "./haulier-validation";
import { indexgenerater } from "./indexgenerater";

const HAULIER_INDEX_CODE = "HAU";

export class HaulierService {
  constructor(
    private readonly repo: HaulierRepository,
    private readonly index: indexgenerater,
  ) {}

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
    if (!row) throw new MdmError("NOT_FOUND", "Haulier was not found", 404);
    return serializeRow(row);
  }

  async create(input: HaulierInput, actor: string) {
    const id = await this.nextHaulierId();
    if (!input.code) input.code = id;
    return this.repo.withTransaction(async (client) => {
      const row = await this.repo.insert(client, input, actor, id);
      await this.repo.snapshot(client, row.id, actor);
      await this.repo.audit(client, row.id, "CREATE", actor, input.changeNote ?? null, { status: "DRAFT" });
      return { id: row.id, code: input.code, status: "DRAFT" as const, versionNo: row.versionNo };
    });
  }

  async update(id: string, input: HaulierInput, actor: string) {
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status === "PENDING") {
        throw new MdmError("LOCKED", "PENDING Haulier cannot be amended", 409);
      }
      if (current.version_no !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      const nextStatus = nextAmendStatus(current, input.rate);
      await this.repo.update(client, id, input, actor, nextStatus);
      const row = await this.repo.lock(client, id);
      await this.repo.snapshot(client, id, actor);
      await this.repo.audit(client, id, "UPDATE", actor, input.changeNote ?? null, {
        versionNo: row.version_no,
        status: nextStatus,
      });
      return { id, versionNo: row.version_no, status: nextStatus };
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
    const headers = ["code", "name", "vehicleTypes", "rateBasis", "rate", "contractStart", "contractEnd", "status"];
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
    next: (current: HaulierRow) => { status: string; action: string },
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

  private async nextHaulierId() {
    const id = await this.index.getGindexMst(HAULIER_INDEX_CODE);
    await this.index.updateGindexMst(HAULIER_INDEX_CODE);
    return id;
  }
}

function nextAmendStatus(current: HaulierRow, rate: number) {
  if (current.status === "PUBLISHED") return sameRate(current.rate, rate) ? "DRAFT" : "PENDING";
  if (current.status === "REJECTED") return "DRAFT";
  return current.status;
}

function sameRate(current: number, next: number) {
  return Number(current).toFixed(2) === Number(next).toFixed(2);
}

function serializeRow(row: Record<string, unknown>) {
  const contractEnd = dateOnly(row.contractEnd);
  return {
    ...row,
    zoneIds: row.zoneIds ?? [],
    contractStart: dateOnly(row.contractStart),
    contractEnd,
    insuranceExpiry: dateOnly(row.insuranceExpiry),
    validFrom: dateOnly(row.validFrom),
    validTo: dateOnly(row.validTo),
    expiring: typeof contractEnd === "string" ? isExpiring(contractEnd) : false,
  };
}

function dateOnly(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return value ?? null;
}

function csvCell(value: unknown) {
  const text = value == null ? "" : Array.isArray(value) ? value.join("|") : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

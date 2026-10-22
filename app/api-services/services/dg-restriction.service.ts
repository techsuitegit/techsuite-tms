import { MdmError } from "../errors/mdm-error";
import {
  mapDbError,
  type DgRestrictionRepository,
  type DgZoneRow,
} from "../repositories/dg-restriction.repository";
import type { DgRestrictionInput } from "./dg-restriction-types";
import {
  assertPublishableSource,
  parseCreateBody,
  parseStatusFilter,
  validateParamsAgainstKind,
} from "./dg-restriction-validation";
import { indexgenerater } from "./indexgenerater";

const DGZ_INDEX_CODE = "DGZ";

export class DgRestrictionService {
  constructor(
    private readonly repo: DgRestrictionRepository,
    private readonly index: indexgenerater,
  ) {}

  async list(query: URLSearchParams) {
    parseStatusFilter(query.get("status"));
    const page = Math.max(1, Number(query.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") ?? 20) || 20));
    const result = await this.repo.list({
      q: query.get("q")?.trim() ?? "",
      status: query.get("status")?.trim() || null,
      kindCode: query.get("kindCode")?.trim().toUpperCase() || null,
      dgClass: query.get("dgClass")?.trim() || null,
      sourceKind: query.get("sourceKind")?.trim() || null,
      reviewDueBefore: query.get("reviewDueBefore")?.trim() || null,
      page,
      pageSize,
      sortKey: query.get("sort")?.trim() || "updatedAt",
    });
    return { items: result.rows.map(serializeRow), total: result.total, page };
  }

  async getById(id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new MdmError("NOT_FOUND", "DG Restriction Zone was not found", 404);
    return serializeRow(row);
  }

  async create(input: DgRestrictionInput, actor: string) {
    await this.assertKindAndParams(input);
    const id = await this.nextId();
    if (!input.code) input.code = id;
    return this.repo.withTransaction(async (client) => {
      const created = await this.repo.insert(client, input, actor, id);
      await this.repo.snapshot(client, created.id, actor);
      await this.repo.audit(client, created.id, "CREATE", actor, input.changeNote ?? null, { status: "DRAFT" });
      return { id: created.id, code: input.code, status: "DRAFT" as const, versionNo: created.versionNo };
    });
  }

  async update(id: string, input: DgRestrictionInput, actor: string) {
    await this.assertKindAndParams(input);
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      if (current.status === "PENDING") {
        throw new MdmError("LOCKED", "PENDING DG Restriction Zone cannot be amended", 409);
      }
      if (current.version_no !== input.versionNo) {
        throw new MdmError("STALE_VERSION", "record changed by another user", 409);
      }
      if (current.code !== input.code) {
        throw new MdmError("CODE_LOCKED", "code is locked after first save", 409, "code");
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
    const detail = await this.repo.findById(id);
    if (!detail) throw new MdmError("NOT_FOUND", "DG Restriction Zone was not found", 404);
    assertPublishableSource(String(detail.sourceKind));
    return this.transition(id, actor, reason, (current) => {
      if (current.status !== "DRAFT") throw new MdmError("CONFLICT", "Only DRAFT rows can be submitted", 409);
      assertPublishableSource(current.source_kind);
      return { status: "PENDING", action: "SUBMIT" };
    });
  }

  async approve(id: string, note: string | null, actor: string) {
    const submitter = await this.repo.lastSubmitActor(id);
    if (submitter && submitter === actor) {
      throw new MdmError("MAKER_IS_CHECKER", "Approver must be different from the submitter", 403);
    }
    const detail = await this.repo.findById(id);
    if (!detail) throw new MdmError("NOT_FOUND", "DG Restriction Zone was not found", 404);
    assertPublishableSource(String(detail.sourceKind));
    return this.transition(id, actor, note, (current) => {
      if (current.status !== "PENDING") throw new MdmError("CONFLICT", "Only PENDING rows can be approved", 409);
      assertPublishableSource(current.source_kind);
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

  async archive(id: string, reason: string, actor: string) {
    if (!reason.trim()) throw new MdmError("VALIDATION", "reason is required", 400, "reason");
    return this.transition(id, actor, reason, (current) => {
      if (current.status !== "PUBLISHED") throw new MdmError("CONFLICT", "Only PUBLISHED rows can be archived", 409);
      return { status: "ARCHIVED", action: "ARCHIVE" };
    });
  }

  async remove(id: string, actor: string) {
    return this.repo.withTransaction(async (client) => {
      await this.repo.lock(client, id);
      await this.repo.softDelete(client, id, actor);
      await this.repo.audit(client, id, "REMOVE", actor, null, {});
      return { id, status: "REMOVED" as const };
    });
  }

  async versions(id: string) {
    if (!(await this.repo.findById(id))) throw new MdmError("NOT_FOUND", "DG Restriction Zone was not found", 404);
    return { versions: await this.repo.versions(id) };
  }

  async auditLog(id: string) {
    if (!(await this.repo.findById(id))) throw new MdmError("NOT_FOUND", "DG Restriction Zone was not found", 404);
    return { events: await this.repo.auditLog(id) };
  }

  async lookups(query: URLSearchParams) {
    return this.repo.lookups(query.get("q")?.trim() ?? "");
  }

  async feed(query: URLSearchParams) {
    const asOf = query.get("asOf")?.trim() || todayIso();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      throw new MdmError("ASOF_INVALID", "asOf must be YYYY-MM-DD", 400, "asOf");
    }
    const bbox = parseBbox(query.get("bbox"));
    const dgClasses = query.getAll("dgClass").map((item) => item.trim()).filter(Boolean);
    const items = await this.repo.feed({
      asOf,
      dgClasses,
      kindCode: query.get("kindCode")?.trim().toUpperCase() || null,
      bbox,
    });
    return {
      asOf,
      items: items.map(serializeFeedItem),
      total: items.length,
    };
  }

  async exportGeoJson() {
    const rows = await this.repo.exportFeatureCollection();
    return {
      type: "FeatureCollection",
      features: rows.map((row) => ({
        type: "Feature",
        geometry: row.geometry,
        properties: exportProperties(row),
      })),
    };
  }

  async importFeatureCollection(body: unknown, actor: string) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new MdmError("NOT_A_FEATURE_COLLECTION", "Body must be a GeoJSON FeatureCollection", 400);
    }
    const collection = body as { type?: string; features?: unknown };
    if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
      throw new MdmError("NOT_A_FEATURE_COLLECTION", "Body must be a GeoJSON FeatureCollection", 400);
    }
    const accepted: { id: string; code: string }[] = [];
    const rejected: { index: number; code?: string; error: string }[] = [];
    for (let i = 0; i < collection.features.length; i += 1) {
      const feature = collection.features[i];
      try {
        if (!feature || typeof feature !== "object" || Array.isArray(feature)) {
          throw new MdmError("VALIDATION", "Feature must be an object", 400);
        }
        const f = feature as { type?: string; geometry?: unknown; properties?: Record<string, unknown> };
        if (f.type !== "Feature") throw new MdmError("VALIDATION", "type must be Feature", 400);
        const props = { ...(f.properties ?? {}), geometry: f.geometry };
        const input = parseCreateBody(props);
        const created = await this.create(input, actor);
        accepted.push({ id: created.id, code: created.code });
      } catch (error) {
        const mapped = mapDbError(error);
        const message =
          mapped instanceof MdmError ? mapped.message : error instanceof Error ? error.message : "Import failed";
        const code =
          feature && typeof feature === "object" && !Array.isArray(feature)
            ? String((feature as { properties?: { code?: unknown } }).properties?.code ?? "")
            : "";
        rejected.push({ index: i, code: code || undefined, error: message });
      }
    }
    return { accepted, rejected };
  }

  private async assertKindAndParams(input: DgRestrictionInput) {
    const kind = await this.repo.findKind(input.kindCode);
    if (!kind) throw new MdmError("KIND_UNKNOWN", `Unknown kindCode: ${input.kindCode}`, 400, "kindCode");
    validateParamsAgainstKind(input.params, kind);
  }

  private async transition(
    id: string,
    actor: string,
    note: string | null,
    decide: (current: DgZoneRow) => { status: string; action: string },
  ) {
    return this.repo.withTransaction(async (client) => {
      const current = await this.repo.lock(client, id);
      const next = decide(current);
      await this.repo.setStatus(client, id, next.status, note, actor);
      const updated = await this.repo.lock(client, id);
      await this.repo.snapshot(client, id, actor);
      await this.repo.audit(client, id, next.action, actor, note, { status: next.status });
      return { status: next.status, versionNo: updated.version_no };
    });
  }

  private async nextId() {
    const generated = await this.index.getGindexMst(DGZ_INDEX_CODE);
    await this.index.updateGindexMst(DGZ_INDEX_CODE);
    return generated;
  }
}

function serializeRow(row: Record<string, unknown>) {
  const sourceKind = String(row.sourceKind ?? "");
  const publishable = sourceKind !== "ILLUSTRATIVE";
  return {
    ...row,
    resolvedVersionId: row.versionNo,
    publishable,
    publishBlockReason: publishable ? null : "sourceKind is ILLUSTRATIVE",
  };
}

function serializeFeedItem(row: Record<string, unknown>) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kindCode: row.kindCode,
    dgClasses: row.dgClasses,
    geometry: row.geometry,
    windowFromMin: row.windowFromMin,
    windowToMin: row.windowToMin,
    params: row.params,
    comparatorStatus: row.comparatorStatus,
    validFrom: row.validFrom,
    validTo: row.validTo,
    resolvedVersionId: row.versionNo,
  };
}

function exportProperties(row: Record<string, unknown>) {
  const {
    geometry: _g,
    areaSqKm: _a,
    vertexCount: _v,
    kindName: _kn,
    requiredParams: _rp,
    paramTypes: _pt,
    vehicleAttribute: _va,
    isTimeScoped: _its,
    createdAt: _ca,
    updatedAt: _ua,
    createdBy: _cb,
    updatedBy: _ub,
    ...props
  } = row;
  return props;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseBbox(raw: string | null): [number, number, number, number] | null {
  if (!raw?.trim()) return null;
  const parts = raw.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw new MdmError("BBOX_INVALID", "bbox must be minLon,minLat,maxLon,maxLat", 400, "bbox");
  }
  const [minLon, minLat, maxLon, maxLat] = parts as [number, number, number, number];
  if (minLon >= maxLon || minLat >= maxLat) {
    throw new MdmError("BBOX_INVALID", "bbox extents are invalid", 400, "bbox");
  }
  return [minLon, minLat, maxLon, maxLat];
}

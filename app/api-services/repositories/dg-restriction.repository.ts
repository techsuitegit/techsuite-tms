import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { DgRestrictionInput, DgRestrictionKindRow, GeoJsonPolygon } from "../services/dg-restriction-types";

const SELECT_LIST = `
  z.id, z.code, z.name, z.kind_code as "kindCode",
  z.dg_classes as "dgClasses",
  z.geom as geometry,
  z.bbox_min_lon as "bboxMinLon", z.bbox_min_lat as "bboxMinLat",
  z.bbox_max_lon as "bboxMaxLon", z.bbox_max_lat as "bboxMaxLat",
  z.geom_source as "geomSource",
  z.window_from_min as "windowFromMin", z.window_to_min as "windowToMin",
  z.params, z.source_kind as "sourceKind", z.source_ref as "sourceRef",
  z.source_authority as "sourceAuthority", z.source_dated::text as "sourceDated",
  z.source_url as "sourceUrl", z.review_due::text as "reviewDue", z.notes,
  z.is_current as "isCurrent", z.is_active as "isActive",
  z.valid_from::text as "validFrom", z.valid_to::text as "validTo",
  z.reason, z.change_note as "changeNote", z.status, z.version_no as "versionNo",
  z.external_id as "externalId", z.created_at as "createdAt", z.updated_at as "updatedAt",
  z.created_by as "createdBy", z.updated_by as "updatedBy",
  k.name as "kindName", k.comparator_status as "comparatorStatus",
  k.required_params as "requiredParams", k.param_types as "paramTypes",
  k.vehicle_attribute as "vehicleAttribute", k.is_time_scoped as "isTimeScoped"
`;

const FROM_JOINS = `
  from branch.dg_restriction_zone z
  join branch.dg_restriction_kind k on k.code = z.kind_code
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "z.code",
  name: "z.name",
  status: "z.status",
  kindCode: "z.kind_code",
  validFrom: "z.valid_from",
  reviewDue: "z.review_due",
  updatedAt: "z.updated_at",
};

export type DgZoneRow = {
  id: string;
  status: string;
  version_no: number;
  code: string;
  source_kind: string;
  created_by: string | null;
  updated_by: string | null;
};

export type DgZoneListQuery = {
  q: string;
  status: string | null;
  kindCode: string | null;
  dgClass: string | null;
  sourceKind: string | null;
  reviewDueBefore: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export type DgFeedQuery = {
  asOf: string;
  dgClasses: string[];
  kindCode: string | null;
  bbox: [number, number, number, number] | null;
};

export class DgRestrictionRepository {
  constructor(private readonly pool: Pool) {}

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw mapDbError(error);
    } finally {
      client.release();
    }
  }

  async findKind(code: string): Promise<DgRestrictionKindRow | null> {
    const result = await this.pool.query(
      `select code, name, required_params as "requiredParams", param_types as "paramTypes",
              vehicle_attribute as "vehicleAttribute", is_time_scoped as "isTimeScoped",
              comparator_status as "comparatorStatus"
       from branch.dg_restriction_kind where code = $1`,
      [code],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      ...row,
      paramTypes: (row.paramTypes ?? {}) as Record<string, string>,
      requiredParams: row.requiredParams ?? [],
    };
  }

  async list(query: DgZoneListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["z.deleted_at is null", "z.is_current = true"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(z.code ilike $${values.length} or z.name ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`z.status = $${values.length}`);
    }
    if (query.kindCode) {
      values.push(query.kindCode);
      where.push(`z.kind_code = $${values.length}`);
    }
    if (query.dgClass) {
      values.push(query.dgClass);
      where.push(`(z.dg_classes = '{}' or $${values.length} = any(z.dg_classes))`);
    }
    if (query.sourceKind) {
      values.push(query.sourceKind);
      where.push(`z.source_kind = $${values.length}`);
    }
    if (query.reviewDueBefore) {
      values.push(query.reviewDueBefore);
      where.push(`z.review_due <= $${values.length}::date`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.dg_restriction_zone z where ${where.join(" and ")}`,
      values,
    );
    values.push(query.pageSize, offset);
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS}
       where ${where.join(" and ")}
       order by ${sortCol} asc
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { rows: result.rows.map(enrichGeometryMetrics), total: Number(count.rows[0]?.total ?? 0) };
  }

  async findById(id: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS}
       where z.id=$1 and z.deleted_at is null and z.is_current = true`,
      [id],
    );
    const row = result.rows[0];
    return row ? enrichGeometryMetrics(row) : null;
  }

  async feed(query: DgFeedQuery) {
    const values: unknown[] = [query.asOf];
    const where = [
      "z.deleted_at is null",
      "z.is_current = true",
      "z.status = 'PUBLISHED'",
      "z.is_active = true",
      "z.valid_from <= $1::date",
      "(z.valid_to is null or z.valid_to >= $1::date)",
    ];
    if (query.kindCode) {
      values.push(query.kindCode);
      where.push(`z.kind_code = $${values.length}`);
    }
    if (query.dgClasses.length > 0) {
      values.push(query.dgClasses);
      where.push(`(z.dg_classes = '{}' or z.dg_classes && $${values.length}::text[])`);
    }
    if (query.bbox) {
      const [minLon, minLat, maxLon, maxLat] = query.bbox;
      values.push(minLon, minLat, maxLon, maxLat);
      where.push(
        `z.bbox_max_lon >= $${values.length - 3} and z.bbox_min_lon <= $${values.length - 1}
         and z.bbox_max_lat >= $${values.length - 2} and z.bbox_min_lat <= $${values.length}`,
      );
    }
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS}
       where ${where.join(" and ")}
       order by z.code`,
      values,
    );
    return result.rows.map(enrichGeometryMetrics);
  }

  async lookups(q: string) {
    const values: unknown[] = [];
    const where = ["z.deleted_at is null", "z.is_current = true", "z.status = 'PUBLISHED'", "z.is_active = true"];
    if (q) {
      values.push(`%${q}%`);
      where.push(`(z.code ilike $${values.length} or z.name ilike $${values.length})`);
    }
    const result = await this.pool.query(
      `select z.id, z.code, z.name, z.kind_code as "kindCode", z.version_no as "resolvedVersionId"
       from branch.dg_restriction_zone z
       where ${where.join(" and ")}
       order by z.code`,
      values,
    );
    return result.rows;
  }

  async insert(client: PoolClient, input: DgRestrictionInput, actor: string, id: string) {
    const bbox = polygonBbox(input.geometry);
    const inserted = await client.query(
      `insert into branch.dg_restriction_zone (
         id, code, name, kind_code, dg_classes, geom,
         bbox_min_lon, bbox_min_lat, bbox_max_lon, bbox_max_lat, geom_source,
         window_from_min, window_to_min, params,
         source_kind, source_ref, source_authority, source_dated, source_url,
         review_due, notes, is_current, is_active, valid_from, valid_to,
         reason, change_note, status, version_no, external_id, created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5::text[],$6::jsonb,
         $7,$8,$9,$10,$11,$12,$13,$14::jsonb,
         $15,$16,$17,$18,$19,$20,$21,true,$22,$23,$24,$25,$26,'DRAFT',1,$27,$28,$28
       )
       returning id, status, version_no as "versionNo"`,
      [
        id,
        input.code,
        input.name,
        input.kindCode,
        input.dgClasses,
        JSON.stringify(input.geometry),
        bbox.minLon,
        bbox.minLat,
        bbox.maxLon,
        bbox.maxLat,
        input.geomSource,
        input.windowFromMin,
        input.windowToMin,
        JSON.stringify(input.params),
        input.sourceKind,
        input.sourceRef,
        input.sourceAuthority,
        input.sourceDated,
        input.sourceUrl,
        input.reviewDue,
        input.notes,
        input.isActive,
        input.validFrom,
        input.validTo,
        input.reason,
        input.changeNote,
        input.externalId,
        actor,
      ],
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number };
  }

  async update(client: PoolClient, id: string, input: DgRestrictionInput, actor: string, status: string) {
    const bbox = polygonBbox(input.geometry);
    await client.query(
      `update branch.dg_restriction_zone set
         name=$1, kind_code=$2, dg_classes=$3::text[], geom=$4::jsonb,
         bbox_min_lon=$5, bbox_min_lat=$6, bbox_max_lon=$7, bbox_max_lat=$8,
         geom_source=$9, window_from_min=$10, window_to_min=$11, params=$12::jsonb,
         source_kind=$13, source_ref=$14, source_authority=$15, source_dated=$16, source_url=$17,
         review_due=$18, notes=$19, is_active=$20, valid_from=$21, valid_to=$22,
         reason=$23, change_note=$24, external_id=$25,
         status=$26, version_no=version_no+1, updated_at=now(), updated_by=$27
       where id=$28 and deleted_at is null and is_current = true`,
      [
        input.name,
        input.kindCode,
        input.dgClasses,
        JSON.stringify(input.geometry),
        bbox.minLon,
        bbox.minLat,
        bbox.maxLon,
        bbox.maxLat,
        input.geomSource,
        input.windowFromMin,
        input.windowToMin,
        JSON.stringify(input.params),
        input.sourceKind,
        input.sourceRef,
        input.sourceAuthority,
        input.sourceDated,
        input.sourceUrl,
        input.reviewDue,
        input.notes,
        input.isActive,
        input.validFrom,
        input.validTo,
        input.reason,
        input.changeNote,
        input.externalId,
        status,
        actor,
        id,
      ],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.dg_restriction_zone
       set status=$1, version_no=version_no+1, change_note=coalesce($2, change_note),
           updated_at=now(), updated_by=$3
       where id=$4 and deleted_at is null and is_current = true`,
      [status, note, actor, id],
    );
  }

  async softDelete(client: PoolClient, id: string, actor: string) {
    await client.query(
      `update branch.dg_restriction_zone
       set deleted_at=now(), is_current=false, version_no=version_no+1,
           updated_at=now(), updated_by=$2
       where id=$1 and deleted_at is null`,
      [id, actor],
    );
  }

  async lock(client: PoolClient, id: string): Promise<DgZoneRow> {
    const result = await client.query<DgZoneRow>(
      `select id, status, version_no, code, source_kind, created_by, updated_by
       from branch.dg_restriction_zone
       where id=$1 and deleted_at is null and is_current = true
       for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "DG Restriction Zone was not found", 404);
    return row;
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.dg_restriction_zone_version (dg_restriction_zone_id, version_no, snapshot, recorded_by)
       select z.id, z.version_no,
         (to_jsonb(z) - 'geom') || jsonb_build_object('geometry', z.geom),
         $2
       from branch.dg_restriction_zone z where z.id=$1`,
      [id, actor],
    );
  }

  async audit(
    client: PoolClient,
    id: string,
    action: string,
    actor: string,
    note: string | null,
    payload: Record<string, unknown>,
  ) {
    await client.query(
      `insert into branch.dg_restriction_zone_audit (dg_restriction_zone_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async lastSubmitActor(id: string) {
    const result = await this.pool.query<{ actor: string | null }>(
      `select actor from branch.dg_restriction_zone_audit
       where dg_restriction_zone_id=$1 and action='SUBMIT'
       order by created_at desc limit 1`,
      [id],
    );
    return result.rows[0]?.actor ?? null;
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.dg_restriction_zone_version where dg_restriction_zone_id=$1 order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.dg_restriction_zone_audit where dg_restriction_zone_id=$1 order by created_at`,
      [id],
    );
    return result.rows;
  }

  async exportFeatureCollection() {
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS}
       where z.deleted_at is null and z.is_current = true and z.status in ('DRAFT', 'PUBLISHED')
       order by z.code`,
    );
    return result.rows.map(enrichGeometryMetrics);
  }
}

export function polygonBbox(geometry: GeoJsonPolygon) {
  const ring = geometry.coordinates[0] ?? [];
  if (ring.length < 4) {
    throw new MdmError("GEOMETRY_INVALID", "Polygon ring must have at least 4 positions", 400, "geometry");
  }
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const pos of ring) {
    const lon = pos[0] ?? 0;
    const lat = pos[1] ?? 0;
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, minLat, maxLon, maxLat };
}

function enrichGeometryMetrics(row: Record<string, unknown>) {
  const geometry = row.geometry as GeoJsonPolygon | null;
  const ring = geometry?.coordinates?.[0] ?? [];
  const vertexCount = ring.length;
  const minLon = Number(row.bboxMinLon ?? 0);
  const minLat = Number(row.bboxMinLat ?? 0);
  const maxLon = Number(row.bboxMaxLon ?? 0);
  const maxLat = Number(row.bboxMaxLat ?? 0);
  const areaSqKm = approxBboxAreaKm2(minLon, minLat, maxLon, maxLat);
  const { bboxMinLon: _a, bboxMinLat: _b, bboxMaxLon: _c, bboxMaxLat: _d, ...rest } = row;
  return { ...rest, geometry, vertexCount, areaSqKm };
}

function approxBboxAreaKm2(minLon: number, minLat: number, maxLon: number, maxLat: number) {
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos(midLat);
  const area = Math.abs(maxLon - minLon) * kmPerDegLon * Math.abs(maxLat - minLat) * kmPerDegLat;
  return Math.round(area * 1e6) / 1e6;
}

export function mapDbError(error: unknown): MdmError | unknown {
  if (error instanceof MdmError) return error;
  const pg = error as { code?: string; constraint?: string; message?: string };
  if (pg.code === "23505" && (pg.constraint === "uq_dg_zone_code_current" || pg.message?.includes("uq_dg_zone_code_current"))) {
    return new MdmError("CODE_DUPLICATE", "DG Restriction Zone code already exists", 409, "code");
  }
  if (pg.code === "23505") return new MdmError("CONFLICT", "DG Restriction Zone code or externalId already exists", 409);
  if (pg.code === "23503") return new MdmError("KIND_UNKNOWN", "Restriction kind was not found", 400, "kindCode");
  if (pg.code === "23514") return new MdmError("VALIDATION", "DG Restriction Zone failed a database check", 400);
  return error;
}

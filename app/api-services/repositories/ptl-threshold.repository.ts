import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { PtlThresholdInput } from "../services/ptl-threshold-types";

const SELECT_LIST = `
  id, code, vehicle_class as "vehicleClass", min_load_pct::float8 as "minLoadPct",
  below_action as "belowAction", urgent_exempt as "urgentExempt", override_role as "overrideRole",
  valid_from::text as "validFrom", valid_to::text as "validTo", reason, change_note as "changeNote",
  status, version_no as "versionNo", external_id as "externalId",
  created_at as "createdAt", updated_at as "updatedAt"
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "code",
  vehicleClass: "vehicle_class",
  status: "status",
  validFrom: "valid_from",
  updatedAt: "updated_at",
};

export type PtlThresholdRow = { id: string; status: string; version_no: number; vehicle_class: string };

export type PtlListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class PtlThresholdRepository {
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

  async list(query: PtlListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(code ilike $${values.length} or vehicle_class ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`status = $${values.length}`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.ptl_threshold where ${where.join(" and ")}`,
      values,
    );
    values.push(query.pageSize, offset);
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.ptl_threshold
       where ${where.join(" and ")}
       order by ${sortCol} asc
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { rows: result.rows, total: Number(count.rows[0]?.total ?? 0) };
  }

  async findById(id: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.ptl_threshold where id=$1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findPublishedByClass(vehicleClass: string) {
    const result = await this.pool.query<{ id: string; minLoadPct: number }>(
      `select id, min_load_pct::float8 as "minLoadPct"
       from branch.ptl_threshold
       where vehicle_class=$1 and status='PUBLISHED' and deleted_at is null`,
      [vehicleClass],
    );
    return result.rows[0] ?? null;
  }

  async insert(client: PoolClient, input: PtlThresholdInput, actor: string, id: string) {
    const inserted = await client.query(
      `insert into branch.ptl_threshold (
         id, code, vehicle_class, min_load_pct, below_action, urgent_exempt, override_role,
         valid_from, valid_to, reason, change_note, status, version_no, external_id,
         created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'DRAFT',1,$12,$13,$13
       )
       returning id, status, version_no as "versionNo"`,
      [id, ...insertValues(input, actor)],
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number };
  }

  async update(client: PoolClient, id: string, input: PtlThresholdInput, actor: string, status: string) {
    const values = insertValues(input, actor);
    await client.query(
      `update branch.ptl_threshold set
         code=$1, vehicle_class=$2, min_load_pct=$3, below_action=$4, urgent_exempt=$5, override_role=$6,
         valid_from=$7, valid_to=$8, reason=$9, change_note=$10, external_id=$11,
         status=$13, version_no=version_no+1, updated_at=now(), updated_by=$12
       where id=$14 and deleted_at is null`,
      [...values, status, id],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.ptl_threshold
       set status=$1, version_no=version_no+1, change_note=coalesce($2, change_note), updated_at=now(), updated_by=$3
       where id=$4`,
      [status, note, actor, id],
    );
  }

  async lock(client: PoolClient, id: string): Promise<PtlThresholdRow> {
    const result = await client.query<PtlThresholdRow>(
      `select id, status, version_no, vehicle_class from branch.ptl_threshold
       where id=$1 and deleted_at is null for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "PTL Threshold was not found", 404);
    return row;
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.ptl_threshold_version (ptl_threshold_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(t), $2 from branch.ptl_threshold t where id=$1`,
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
      `insert into branch.ptl_threshold_audit (ptl_threshold_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.ptl_threshold_version where ptl_threshold_id=$1 order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.ptl_threshold_audit where ptl_threshold_id=$1 order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, code as name, vehicle_class as "vehicleClass", min_load_pct::float8 as "minLoadPct"
       from branch.ptl_threshold
       where deleted_at is null and status = 'PUBLISHED'
       order by code`,
    );
    return result.rows;
  }

  async exportRows() {
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.ptl_threshold
       where deleted_at is null and status in ('DRAFT', 'PUBLISHED')
       order by code`,
    );
    return result.rows;
  }
}

function insertValues(input: PtlThresholdInput, actor: string) {
  return [
    input.code,
    input.vehicleClass,
    input.minLoadPct,
    input.belowAction,
    input.urgentExempt,
    input.overrideRole,
    input.validFrom,
    input.validTo,
    input.reason,
    input.changeNote,
    input.externalId,
    actor,
  ];
}

export function mapDbError(error: unknown): MdmError | unknown {
  if (error instanceof MdmError) return error;
  const pg = error as { code?: string; constraint?: string };
  if (pg.code === "23505" && pg.constraint === "ptl_threshold_published_class_udx") {
    return new MdmError("CONFLICT", "A published rule already exists for this vehicle class", 409, "vehicleClass");
  }
  if (pg.code === "23505") {
    return new MdmError("CONFLICT", "PTL Threshold code or externalId already exists", 409);
  }
  if (pg.code === "23514") return new MdmError("VALIDATION", "PTL Threshold failed a database check", 400);
  return error;
}

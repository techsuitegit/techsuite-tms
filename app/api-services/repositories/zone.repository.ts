import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { ZoneInput } from "../services/zone-types";

const SELECT_LIST = `
  z.id, z.code, z.name, z.description,
  z.valid_from::text as "validFrom", z.valid_to::text as "validTo",
  z.reason, z.change_note as "changeNote", z.status, z.version_no as "versionNo",
  z.external_id as "externalId", z.created_at as "createdAt", z.updated_at as "updatedAt"
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "z.code",
  name: "z.name",
  status: "z.status",
  validFrom: "z.valid_from",
  updatedAt: "z.updated_at",
};

export type ZoneRow = {
  id: string;
  status: string;
  version_no: number;
};

export type ZoneListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class ZoneRepository {
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

  async list(query: ZoneListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["z.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(z.code ilike $${values.length} or z.name ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`z.status = $${values.length}`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.zone z where ${where.join(" and ")}`,
      values,
    );
    values.push(query.pageSize, offset);
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.zone z
       where ${where.join(" and ")}
       order by ${sortCol} asc
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { rows: result.rows, total: Number(count.rows[0]?.total ?? 0) };
  }

  async findById(id: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.zone z where z.id=$1 and z.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async hasDivisions(id: string) {
    const column = await this.pool.query(
      `select 1 from information_schema.columns
       where table_schema = 'branch' and table_name = 'division' and column_name = 'zone_id'`,
    );
    if ((column.rowCount ?? 0) === 0) return false;
    const result = await this.pool.query(
      `select 1 from branch.division where zone_id = $1 and deleted_at is null limit 1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async insert(client: PoolClient, input: ZoneInput, actor: string) {
    const inserted = await client.query(
      `insert into branch.zone (
         code, name, description, valid_from, valid_to, reason, change_note,
         status, version_no, external_id, created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,'DRAFT',1,$8,$9,$9
       )
       returning id, status, version_no as "versionNo"`,
      insertValues(input, actor),
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number };
  }

  async update(client: PoolClient, id: string, input: ZoneInput, actor: string, status: string) {
    const values = insertValues(input, actor);
    await client.query(
      `update branch.zone set
         code=$1, name=$2, description=$3, valid_from=$4, valid_to=$5, reason=$6, change_note=$7,
         external_id=$8, status=$10, version_no=version_no+1, updated_at=now(), updated_by=$9
       where id=$11 and deleted_at is null`,
      [...values, status, id],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.zone
       set status=$1, version_no=version_no+1, change_note=coalesce($2, change_note), updated_at=now(), updated_by=$3
       where id=$4 and deleted_at is null`,
      [status, note, actor, id],
    );
  }

  async softDelete(client: PoolClient, id: string, actor: string) {
    await client.query(
      `update branch.zone
       set deleted_at=now(), version_no=version_no+1, updated_at=now(), updated_by=$2
       where id=$1 and deleted_at is null`,
      [id, actor],
    );
  }

  async lock(client: PoolClient, id: string): Promise<ZoneRow> {
    const result = await client.query<ZoneRow>(
      `select id, status, version_no from branch.zone where id=$1 and deleted_at is null for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "Zone was not found", 404);
    return row;
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.zone_version (zone_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(z), $2 from branch.zone z where id=$1`,
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
      `insert into branch.zone_audit (zone_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.zone_version where zone_id=$1 order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.zone_audit where zone_id=$1 order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, name
       from branch.zone
       where deleted_at is null and status = 'PUBLISHED'
       order by code`,
    );
    return result.rows;
  }

  async exportRows() {
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.zone z
       where z.deleted_at is null and z.status in ('DRAFT', 'PUBLISHED')
       order by z.code`,
    );
    return result.rows;
  }
}

function insertValues(input: ZoneInput, actor: string) {
  return [
    input.code,
    input.name,
    input.description,
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
  if (pg.code === "23505" && pg.constraint === "zone_code_udx") {
    return new MdmError("CONFLICT", "Zone code already exists", 409, "code");
  }
  if (pg.code === "23505") {
    return new MdmError("CONFLICT", "Zone code or externalId already exists", 409);
  }
  if (pg.code === "23503") return new MdmError("PARENT_NOT_FOUND", "Related row was not found", 400);
  if (pg.code === "23514") return new MdmError("VALIDATION", "Zone failed a database check", 400);
  return error;
}

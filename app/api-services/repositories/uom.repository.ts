import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { UomInput } from "../services/uom-types";

const SELECT_LIST = `
  u.id, u.code, u.name, u.is_base as "isBase",
  u.factor_to_base::float8 as "factorToBase", u.decimal_places as "decimalPlaces",
  u.rounding, u.dimension,
  u.valid_from::text as "validFrom", u.valid_to::text as "validTo",
  u.reason, u.change_note as "changeNote",
  u.status, u.version_no as "versionNo", u.external_id as "externalId",
  u.created_at as "createdAt", u.updated_at as "updatedAt"
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "u.code",
  name: "u.name",
  status: "u.status",
  validFrom: "u.valid_from",
  updatedAt: "u.updated_at",
};

export type UomRow = { id: string; status: string; version_no: number; external_id: string | null };

export type UomListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class UomRepository {
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

  async list(query: UomListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["u.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(u.code ilike $${values.length} or u.name ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`u.status = $${values.length}`);
    }

    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.uom u where ${where.join(" and ")}`,
      values,
    );
    values.push(query.pageSize, offset);
    const result = await this.pool.query(
      `select ${SELECT_LIST}
       from branch.uom u
       where ${where.join(" and ")}
       order by ${sortCol} asc
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { rows: result.rows, total: Number(count.rows[0]?.total ?? 0) };
  }

  async findById(id: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST}
       from branch.uom u
       where u.id=$1 and u.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async lock(client: PoolClient, id: string) {
    const result = await client.query<UomRow>(
      `select id, status, version_no, external_id
       from branch.uom
       where id=$1 and deleted_at is null
       for update`,
      [id],
    );
    if (!result.rows[0]) throw new MdmError("NOT_FOUND", "UOM was not found", 404);
    return result.rows[0];
  }

  async findByExternalId(client: PoolClient, externalId: string) {
    const result = await client.query<UomRow>(
      `select id, status, version_no, external_id
       from branch.uom
       where external_id=$1 and deleted_at is null
       for update`,
      [externalId],
    );
    return result.rows[0] ?? null;
  }

  async insert(client: PoolClient, input: UomInput, actor: string) {
    const inserted = await client.query(
      `insert into branch.uom (
         code, name, is_base, factor_to_base, decimal_places, rounding, dimension,
         valid_from, valid_to, reason, change_note,
         status, version_no, external_id, created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, 'PUBLISHED', 1, $12, $13, $13
       )
       returning id, status, version_no as "versionNo", external_id as "externalId"`,
      insertValues(input, actor),
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number; externalId: string | null };
  }

  async updatePublished(client: PoolClient, id: string, input: UomInput, actor: string) {
    const values = insertValues(input, actor);
    await client.query(
      `update branch.uom set
         code=$1, name=$2, is_base=$3, factor_to_base=$4, decimal_places=$5,
         rounding=$6, dimension=$7, valid_from=$8, valid_to=$9,
         reason=$10, change_note=$11, external_id=$12,
         status='PUBLISHED', version_no=version_no+1, updated_at=now(), updated_by=$13
       where id=$14 and deleted_at is null`,
      [...values, id],
    );
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.uom_version (uom_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(u), $2
       from branch.uom u
       where id=$1`,
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
      `insert into branch.uom_audit (uom_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.uom_version
       where uom_id = $1
       order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.uom_audit
       where uom_id = $1
       order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, name
       from branch.uom
       where deleted_at is null and status = 'PUBLISHED'
       order by code`,
    );
    return result.rows;
  }
}

function insertValues(input: UomInput, actor: string) {
  return [
    input.code,
    input.name,
    input.isBase,
    input.factorToBase,
    input.decimalPlaces,
    input.rounding,
    input.dimension ?? null,
    input.validFrom,
    input.validTo ?? null,
    input.reason,
    input.changeNote ?? null,
    input.externalId ?? null,
    actor,
  ];
}

export function mapDbError(error: unknown): MdmError | unknown {
  if (error instanceof MdmError) return error;
  const pg = error as { code?: string };
  if (pg.code === "23505") return new MdmError("CONFLICT", "UOM code or externalId already exists", 409);
  if (pg.code === "23514") return new MdmError("VALIDATION", "UOM failed a database check", 400);
  return error;
}

import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { VendorInput } from "../services/vendor-types";

const SELECT_LIST = `
  v.id, v.code, v.name, v.type, v.active,
  v.valid_from as "validFrom", v.valid_to as "validTo",
  v.reason, v.change_note as "changeNote",
  v.status, v.version_no as "versionNo", v.external_id as "externalId",
  v.created_at as "createdAt", v.updated_at as "updatedAt"
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "v.code",
  name: "v.name",
  status: "v.status",
  validFrom: "v.valid_from",
  updatedAt: "v.updated_at",
};

export type VendorRow = { id: string; status: string; version_no: number; external_id: string | null };

export type VendorListQuery = {
  q: string;
  status: string | null;
  type: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class VendorRepository {
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

  async list(query: VendorListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["v.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(v.code ilike $${values.length} or v.name ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`v.status = $${values.length}`);
    }
    if (query.type) {
      values.push(query.type);
      where.push(`v.type = $${values.length}`);
    }

    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.vendor v where ${where.join(" and ")}`,
      values,
    );
    values.push(query.pageSize, offset);
    const result = await this.pool.query(
      `select ${SELECT_LIST}
       from branch.vendor v
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
       from branch.vendor v
       where v.id=$1 and v.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findByExternalId(client: PoolClient, externalId: string) {
    const result = await client.query<VendorRow>(
      `select id, status, version_no, external_id
       from branch.vendor
       where external_id=$1 and deleted_at is null
       for update`,
      [externalId],
    );
    return result.rows[0] ?? null;
  }

  async insert(client: PoolClient, input: VendorInput, actor: string) {
    const inserted = await client.query(
      `insert into branch.vendor (
         code, name, type, active, valid_from, valid_to, reason, change_note,
         status, version_no, external_id, created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8, 'PUBLISHED', 1, $9, $10, $10
       )
       returning id, status, version_no as "versionNo", external_id as "externalId"`,
      insertValues(input, actor),
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number; externalId: string };
  }

  async updatePublished(client: PoolClient, id: string, input: VendorInput, actor: string) {
    const values = insertValues(input, actor);
    await client.query(
      `update branch.vendor set
         code=$1, name=$2, type=$3, active=$4, valid_from=$5, valid_to=$6,
         reason=$7, change_note=$8, external_id=$9,
         status='PUBLISHED', version_no=version_no+1, updated_at=now(), updated_by=$10
       where id=$11 and deleted_at is null`,
      [...values, id],
    );
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.vendor_version (vendor_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(v), $2
       from branch.vendor v
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
      `insert into branch.vendor_audit (vendor_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.vendor_version
       where vendor_id = $1
       order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.vendor_audit
       where vendor_id = $1
       order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups(type: string | null) {
    const values: unknown[] = [];
    const typeClause = type
      ? (values.push(type), `and type = $${values.length}`)
      : "";
    const result = await this.pool.query(
      `select id, code, name
       from branch.vendor
       where deleted_at is null and status = 'PUBLISHED' and active = true ${typeClause}
       order by code`,
      values,
    );
    return result.rows;
  }
}

function insertValues(input: VendorInput, actor: string) {
  return [
    input.code,
    input.name,
    input.type,
    input.active,
    input.validFrom,
    input.validTo ?? null,
    input.reason,
    input.changeNote ?? null,
    input.externalId,
    actor,
  ];
}

export function mapDbError(error: unknown): MdmError | unknown {
  if (error instanceof MdmError) return error;
  const pg = error as { code?: string };
  if (pg.code === "23505") return new MdmError("CONFLICT", "Vendor code or externalId already exists", 409);
  if (pg.code === "23514") return new MdmError("VALIDATION", "Vendor failed a database check", 400);
  return error;
}

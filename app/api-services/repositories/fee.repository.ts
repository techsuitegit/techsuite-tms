import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { FeeInput } from "../services/fee-types";

const SELECT_LIST = `
  f.id, f.code, f.name, f.fee_type as "feeType", f.charge_type as "chargeType",
  f.rate::float8 as rate, f.currency,
  f.valid_from::text as "validFrom", f.valid_to::text as "validTo",
  f.reason, f.change_note as "changeNote",
  f.status, f.version_no as "versionNo", f.external_id as "externalId",
  f.created_at as "createdAt", f.updated_at as "updatedAt"
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "f.code",
  name: "f.name",
  status: "f.status",
  validFrom: "f.valid_from",
  updatedAt: "f.updated_at",
};

export type FeeRow = { id: string; status: string; version_no: number; rate: string };

export type FeeListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class FeeRepository {
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

  async list(query: FeeListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["f.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(f.code ilike $${values.length} or f.name ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`f.status = $${values.length}`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.fee f where ${where.join(" and ")}`,
      values,
    );
    values.push(query.pageSize, offset);
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.fee f where ${where.join(" and ")}
       order by ${sortCol} asc
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { rows: result.rows, total: Number(count.rows[0]?.total ?? 0) };
  }

  async findById(id: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.fee f where f.id=$1 and f.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async lock(client: PoolClient, id: string): Promise<FeeRow> {
    const result = await client.query<FeeRow>(
      `select id, status, version_no, rate::text as rate
       from branch.fee where id=$1 and deleted_at is null for update`,
      [id],
    );
    if (!result.rows[0]) throw new MdmError("NOT_FOUND", "Fee was not found", 404);
    return result.rows[0];
  }

  async insert(client: PoolClient, input: FeeInput, actor: string, id: string) {
    const inserted = await client.query(
      `insert into branch.fee (
         id, code, name, fee_type, charge_type, rate, currency, valid_from, valid_to,
         reason, change_note, external_id, status, version_no, created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, 'DRAFT', 1, $13, $13
       )
       returning id, status, version_no as "versionNo"`,
      [id, ...insertValues(input), actor],
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number };
  }

  async update(client: PoolClient, id: string, input: FeeInput, actor: string, status: string) {
    await client.query(
      `update branch.fee set
         code=$1, name=$2, fee_type=$3, charge_type=$4, rate=$5, currency=$6,
         valid_from=$7, valid_to=$8, reason=$9, change_note=$10, external_id=$11,
         status=$13, version_no=version_no+1, updated_at=now(), updated_by=$12
       where id=$14 and deleted_at is null`,
      [...insertValues(input), actor, status, id],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.fee
       set status=$1, version_no=version_no+1, change_note=$2, updated_at=now(), updated_by=$3
       where id=$4`,
      [status, note, actor, id],
    );
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.fee_version (fee_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(f), $2 from branch.fee f where id=$1`,
      [id, actor],
    );
  }

  async audit(client: PoolClient, id: string, action: string, actor: string, note: string | null, payload: Record<string, unknown>) {
    await client.query(
      `insert into branch.fee_audit (fee_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.fee_version where fee_id=$1 order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.fee_audit where fee_id=$1 order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, name from branch.fee
       where deleted_at is null and status = 'PUBLISHED' order by code`,
    );
    return result.rows;
  }

  async exportRows() {
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.fee f
       where f.deleted_at is null and f.status in ('DRAFT', 'PUBLISHED')
       order by f.code`,
    );
    return result.rows;
  }
}

function insertValues(input: FeeInput) {
  return [
    input.code,
    input.name,
    input.feeType,
    input.chargeType,
    input.rate,
    input.currency,
    input.validFrom,
    input.validTo ?? null,
    input.reason,
    input.changeNote ?? null,
    input.externalId ?? null,
  ];
}

export function mapDbError(error: unknown): MdmError | unknown {
  if (error instanceof MdmError) return error;
  const pg = error as { code?: string };
  if (pg.code === "23505") return new MdmError("CONFLICT", "Fee code or externalId already exists", 409);
  if (pg.code === "23514") return new MdmError("VALIDATION", "Fee failed a database check", 400);
  return error;
}

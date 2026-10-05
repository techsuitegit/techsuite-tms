import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { CostCentreInput } from "../services/cost-centre-types";

const SELECT_LIST = `
  c.id, c.code, c.name,
  c.division_id as "divisionId", d.code as "divisionCode", d.name as "divisionName",
  c.shipping_point_id as "shippingPointId", sp.code as "shippingPointCode", sp.name as "shippingPointName",
  c.type, c.budget_owner as "budgetOwner", c.default_gl as "defaultGl",
  c.annual_budget as "annualBudget", c.active,
  c.valid_from::text as "validFrom", c.valid_to::text as "validTo",
  c.reason, c.change_note as "changeNote", c.status, c.version_no as "versionNo",
  c.external_id as "externalId", c.created_at as "createdAt", c.updated_at as "updatedAt"
`;

const FROM_JOINS = `
  from branch.cost_centre c
  join branch.division d on d.id = c.division_id
  left join branch.shipping_point sp on sp.id = c.shipping_point_id
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "c.code",
  name: "c.name",
  status: "c.status",
  validFrom: "c.valid_from",
  updatedAt: "c.updated_at",
};

export type CostCentreLocked = {
  id: string;
  status: string;
  version_no: number;
  annual_budget: string | null;
  default_gl: string | null;
};

export type CostCentreListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class CostCentreRepository {
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

  async list(query: CostCentreListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["c.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(c.code ilike $${values.length} or c.name ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`c.status = $${values.length}`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.cost_centre c where ${where.join(" and ")}`,
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
    return { rows: result.rows, total: Number(count.rows[0]?.total ?? 0) };
  }

  async findById(id: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS} where c.id=$1 and c.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findDivision(id: string) {
    const result = await this.pool.query<{ status: string }>(
      `select status from branch.division where id=$1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findShippingPoint(id: string) {
    const result = await this.pool.query<{ status: string; divisionId: string }>(
      `select status, division_id as "divisionId" from branch.shipping_point where id=$1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async insert(client: PoolClient, input: CostCentreInput, actor: string) {
    const inserted = await client.query(
      `insert into branch.cost_centre (
         code, name, division_id, shipping_point_id, type, budget_owner, default_gl, annual_budget, active,
         valid_from, valid_to, reason, change_note, external_id, status, version_no, created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'DRAFT',1,$15,$15
       )
       returning id, status, version_no as "versionNo"`,
      insertValues(input, actor),
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number };
  }

  async update(client: PoolClient, id: string, input: CostCentreInput, actor: string, status: string) {
    const values = insertValues(input, actor);
    await client.query(
      `update branch.cost_centre set
         code=$1, name=$2, division_id=$3, shipping_point_id=$4, type=$5, budget_owner=$6, default_gl=$7,
         annual_budget=$8, active=$9, valid_from=$10, valid_to=$11, reason=$12, change_note=$13, external_id=$14,
         status=$16, version_no=version_no+1, updated_at=now(), updated_by=$15
       where id=$17 and deleted_at is null`,
      [...values, status, id],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.cost_centre
       set status=$1, version_no=version_no+1, change_note=coalesce($2, change_note), updated_at=now(), updated_by=$3
       where id=$4 and deleted_at is null`,
      [status, note, actor, id],
    );
  }

  async lock(client: PoolClient, id: string): Promise<CostCentreLocked> {
    const result = await client.query<CostCentreLocked>(
      `select id, status, version_no, annual_budget::text, default_gl
       from branch.cost_centre where id=$1 and deleted_at is null for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "Cost Centre was not found", 404);
    return row;
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.cost_centre_version (cost_centre_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(c), $2 from branch.cost_centre c where id=$1`,
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
      `insert into branch.cost_centre_audit (cost_centre_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.cost_centre_version where cost_centre_id=$1 order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.cost_centre_audit where cost_centre_id=$1 order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, name from branch.cost_centre
       where deleted_at is null and status = 'PUBLISHED' and active = true
       order by code`,
    );
    return result.rows;
  }

  async exportRows() {
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS}
       where c.deleted_at is null and c.status in ('DRAFT', 'PUBLISHED')
       order by c.code`,
    );
    return result.rows;
  }
}

function insertValues(input: CostCentreInput, actor: string) {
  return [
    input.code,
    input.name,
    input.divisionId,
    input.shippingPointId,
    input.type,
    input.budgetOwner,
    input.defaultGl,
    input.annualBudget,
    input.active,
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
  if (pg.code === "23505" && pg.constraint === "cost_centre_code_udx") {
    return new MdmError("CONFLICT", "Cost Centre code already exists", 409, "code");
  }
  if (pg.code === "23505") {
    return new MdmError("CONFLICT", "Cost Centre code or externalId already exists", 409);
  }
  if (pg.code === "23503") return new MdmError("PARENT_NOT_FOUND", "Division or Shipping Point was not found", 400);
  if (pg.code === "23514") return new MdmError("VALIDATION", "Cost Centre failed a database check", 400);
  return error;
}

import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { PricingProcedureInput, PricingRuleInput } from "../services/pricing-procedure-types";

const SELECT_LIST = `
  p.id, p.code, p.name, p.access_sequence as "accessSequence", p.active,
  p.valid_from::text as "validFrom", p.valid_to::text as "validTo",
  p.reason, p.change_note as "changeNote",
  p.status, p.version_no as "versionNo", p.external_id as "externalId",
  p.created_at as "createdAt", p.updated_at as "updatedAt"
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "p.code",
  name: "p.name",
  status: "p.status",
  validFrom: "p.valid_from",
  updatedAt: "p.updated_at",
};

export type PricingProcedureRow = { id: string; status: string; version_no: number };

export type StoredRule = {
  id: string;
  code: string;
  priority: number;
  join: "AND" | "OR";
  amount: number;
  conditions: { id: string; variable: string; operator: string; value: string | null }[];
};

export type PricingListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class PricingProcedureRepository {
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

  async list(query: PricingListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["p.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(p.code ilike $${values.length} or p.name ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`p.status = $${values.length}`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.pricing_procedure p where ${where.join(" and ")}`,
      values,
    );
    values.push(query.pageSize, offset);
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.pricing_procedure p where ${where.join(" and ")}
       order by ${sortCol} asc
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { rows: result.rows, total: Number(count.rows[0]?.total ?? 0) };
  }

  async findById(id: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST} from branch.pricing_procedure p where p.id=$1 and p.deleted_at is null`,
      [id],
    );
    if (!result.rows[0]) return null;
    return { ...result.rows[0], rules: await this.rulesFor(id) };
  }

  async lock(client: PoolClient, id: string): Promise<PricingProcedureRow> {
    const result = await client.query<PricingProcedureRow>(
      `select id, status, version_no from branch.pricing_procedure where id=$1 and deleted_at is null for update`,
      [id],
    );
    if (!result.rows[0]) throw new MdmError("NOT_FOUND", "Pricing Procedure was not found", 404);
    return result.rows[0];
  }

  async findMaterial(id: string) {
    const result = await this.pool.query<{ status: string }>(
      `select status from branch.material where id=$1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async insert(client: PoolClient, input: PricingProcedureInput, actor: string) {
    const inserted = await client.query(
      `insert into branch.pricing_procedure (
         code, name, access_sequence, active, valid_from, valid_to, reason, change_note, external_id,
         status, version_no, created_by, updated_by
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9, 'DRAFT', 1, $10, $10)
       returning id, status, version_no as "versionNo"`,
      [...headerValues(input), actor],
    );
    const created = inserted.rows[0] as { id: string; status: string; versionNo: number };
    await this.replaceRules(client, created.id, input.rules);
    return created;
  }

  async update(client: PoolClient, id: string, input: PricingProcedureInput, actor: string, status: string) {
    await client.query(
      `update branch.pricing_procedure set
         code=$1, name=$2, access_sequence=$3, active=$4, valid_from=$5, valid_to=$6,
         reason=$7, change_note=$8, external_id=$9,
         status=$11, version_no=version_no+1, updated_at=now(), updated_by=$10
       where id=$12 and deleted_at is null`,
      [...headerValues(input), actor, status, id],
    );
    await this.replaceRules(client, id, input.rules);
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.pricing_procedure
       set status=$1, version_no=version_no+1, change_note=$2, updated_at=now(), updated_by=$3
       where id=$4`,
      [status, note, actor, id],
    );
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.pricing_procedure_version (procedure_id, version_no, snapshot, recorded_by)
       select p.id, p.version_no, jsonb_build_object(
         'procedure', to_jsonb(p),
         'rules', coalesce((
           select jsonb_agg(jsonb_build_object(
             'rule', to_jsonb(r),
             'conditions', coalesce((
               select jsonb_agg(to_jsonb(c) order by c.id)
               from branch.pricing_rule_condition c where c.rule_id = r.id
             ), '[]'::jsonb)
           ) order by r.priority, r.code)
           from branch.pricing_rule r where r.procedure_id = p.id
         ), '[]'::jsonb)
       ), $2
       from branch.pricing_procedure p where p.id=$1`,
      [id, actor],
    );
  }

  async audit(client: PoolClient, id: string, action: string, actor: string, note: string | null, payload: Record<string, unknown>) {
    await client.query(
      `insert into branch.pricing_procedure_audit (procedure_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.pricing_procedure_version where procedure_id=$1 order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.pricing_procedure_audit where procedure_id=$1 order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, name from branch.pricing_procedure
       where deleted_at is null and status = 'PUBLISHED' order by code`,
    );
    return result.rows;
  }

  async exportRows() {
    const headers = await this.pool.query(
      `select id from branch.pricing_procedure
       where deleted_at is null and status in ('DRAFT', 'PUBLISHED')
       order by code`,
    );
    const rows = [];
    for (const header of headers.rows) {
      rows.push(await this.findById(header.id as string));
    }
    return rows;
  }

  async rulesFor(procedureId: string, client?: PoolClient): Promise<StoredRule[]> {
    const queryable = client ?? this.pool;
    const result = await queryable.query(
      `select r.id as "ruleId", r.code, r.priority, r.join_op as "join", r.amount::float8 as amount,
              c.id as "conditionId", c.variable, c.operator, c.value
       from branch.pricing_rule r
       left join branch.pricing_rule_condition c on c.rule_id = r.id
       where r.procedure_id=$1
       order by r.priority asc, r.code asc, c.id asc`,
      [procedureId],
    );
    const rules: StoredRule[] = [];
    for (const row of result.rows) {
      let rule = rules.find((item) => item.id === row.ruleId);
      if (!rule) {
        rule = { id: row.ruleId, code: row.code, priority: row.priority, join: row.join, amount: row.amount, conditions: [] };
        rules.push(rule);
      }
      if (row.conditionId) {
        rule.conditions.push({ id: row.conditionId, variable: row.variable, operator: row.operator, value: row.value });
      }
    }
    return rules;
  }

  private async replaceRules(client: PoolClient, procedureId: string, rules: PricingRuleInput[]) {
    await client.query(
      `delete from branch.pricing_rule_condition
       where rule_id in (select id from branch.pricing_rule where procedure_id=$1)`,
      [procedureId],
    );
    await client.query(`delete from branch.pricing_rule where procedure_id=$1`, [procedureId]);
    for (const rule of rules) {
      const inserted = await client.query(
        `insert into branch.pricing_rule (procedure_id, code, priority, join_op, amount)
         values ($1,$2,$3,$4,$5) returning id`,
        [procedureId, rule.code, rule.priority, rule.join, rule.amount],
      );
      const ruleId = inserted.rows[0].id as string;
      for (const condition of rule.conditions) {
        await client.query(
          `insert into branch.pricing_rule_condition (rule_id, variable, operator, value)
           values ($1,$2,$3,$4)`,
          [ruleId, condition.variable, condition.operator, condition.value],
        );
      }
    }
  }
}

function headerValues(input: PricingProcedureInput) {
  return [
    input.code,
    input.name,
    input.accessSequence,
    input.active,
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
  if (pg.code === "23505") return new MdmError("CONFLICT", "Pricing Procedure code or externalId already exists", 409);
  if (pg.code === "23503") return new MdmError("PARENT_NOT_FOUND", "Material was not found", 400);
  if (pg.code === "23514") return new MdmError("VALIDATION", "Pricing Procedure failed a database check", 400);
  return error;
}

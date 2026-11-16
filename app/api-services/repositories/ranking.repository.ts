import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type {
  CustomerClassRow,
  DeliveryMode,
  RankingTrigger,
  ScoredOrder,
  WeightComponent,
  WeightSet,
} from "../services/ranking-types";

const POOL_SELECT = `
  o.id, o.order_no as "orderNo", o.customer_code as "customerCode", o.customer_name as "customerName",
  o.material_id as "materialId", m.code as "materialCode", m.name as "materialName",
  o.storage_tank_id as "storageTankId", o.is_packed as "isPacked",
  o.shipping_point_id as "shippingPointId", o.division_id as "divisionId",
  o.mode, o.due_date::text as "dueDate",
  o.qualified_qty::float8 as "qualifiedQty", o.qualified_qty_uom_id as "qualifiedQtyUomId",
  coalesce(u.code, '') as "qualifiedQtyUomCode",
  o.order_value::float8 as "orderValue", o.status,
  o.qual_outcome as "qualOutcome",
  o.rank_position as "rankPosition", o.rank_override_id as "rankOverrideId",
  o.version_no as "versionNo"
`;

export class RankingRepository {
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
      throw error;
    } finally {
      client.release();
    }
  }

  async tryRunLock(client: PoolClient) {
    const result = await client.query<{ locked: boolean }>(
      `select pg_try_advisory_lock(hashtext('m03_ranking_run')) as locked`,
    );
    return Boolean(result.rows[0]?.locked);
  }

  async releaseRunLock(client: PoolClient) {
    await client.query(`select pg_advisory_unlock(hashtext('m03_ranking_run'))`);
  }

  async resolveWeightSet(divisionId: string | null, asOf: string | null): Promise<WeightSet | null> {
    const values: unknown[] = [];
    const where = ["deleted_at is null", "status = 'PUBLISHED'"];
    if (asOf) {
      values.push(asOf);
      where.push(`valid_from <= $${values.length}::date`);
      where.push(`(valid_to is null or valid_to >= $${values.length}::date)`);
    } else {
      where.push(`valid_from <= current_date`);
      where.push(`(valid_to is null or valid_to >= current_date)`);
    }
    // Prefer division-specific, else global (division_id is null)
    let orderBy = "case when division_id is null then 1 else 0 end, updated_at desc";
    if (divisionId) {
      values.push(divisionId);
      where.push(`(division_id = $${values.length} or division_id is null)`);
      orderBy = `case when division_id = $${values.length} then 0 else 1 end, updated_at desc`;
    } else {
      where.push(`division_id is null`);
    }
    const header = await this.pool.query(
      `select id, code, name, division_id as "divisionId",
              ordering_strategy as "orderingStrategy", tie_break as "tieBreak",
              total_weight_check as "totalWeightCheck", notes, status, version_no as "versionNo"
       from branch.ranking_weight_set
       where ${where.join(" and ")}
       order by ${orderBy}
       limit 1`,
      values,
    );
    const row = header.rows[0];
    if (!row) return null;
    const components = await this.loadComponents(row.id as string);
    return { ...(row as Omit<WeightSet, "components">), components };
  }

  async loadWeightSetById(id: string): Promise<WeightSet | null> {
    const header = await this.pool.query(
      `select id, code, name, division_id as "divisionId",
              ordering_strategy as "orderingStrategy", tie_break as "tieBreak",
              total_weight_check as "totalWeightCheck", notes, status, version_no as "versionNo"
       from branch.ranking_weight_set
       where id=$1 and deleted_at is null`,
      [id],
    );
    const row = header.rows[0];
    if (!row) return null;
    return { ...(row as Omit<WeightSet, "components">), components: await this.loadComponents(id) };
  }

  async listWeightSets(status: string | null) {
    const values: unknown[] = [];
    const where = ["deleted_at is null"];
    if (status) {
      values.push(status);
      where.push(`status = $${values.length}`);
    }
    const result = await this.pool.query(
      `select id, code, name, division_id as "divisionId",
              ordering_strategy as "orderingStrategy", tie_break as "tieBreak",
              total_weight_check as "totalWeightCheck", notes, status, version_no as "versionNo",
              valid_from::text as "validFrom", valid_to::text as "validTo"
       from branch.ranking_weight_set
       where ${where.join(" and ")}
       order by code`,
      values,
    );
    return result.rows;
  }

  private async loadComponents(weightSetId: string): Promise<WeightComponent[]> {
    const result = await this.pool.query(
      `select component_code as "componentCode", weight_max as "weightMax", sequence, caption,
              decay_per_day::float8 as "decayPerDay",
              value_divisor::float8 as "valueDivisor",
              size_divisor::float8 as "sizeDivisor",
              size_uom_code as "sizeUomCode",
              mode_scores as "modeScores",
              is_enabled as "isEnabled"
       from branch.ranking_weight_component
       where weight_set_id=$1
       order by sequence`,
      [weightSetId],
    );
    return result.rows.map((r) => ({
      ...r,
      modeScores: (r.modeScores as Record<string, number> | null) ?? null,
    })) as WeightComponent[];
  }

  async classCatalogue(): Promise<Map<string, CustomerClassRow>> {
    const result = await this.pool.query(
      `select code, label, score_contribution as "scoreContribution", definition_source as "definitionSource"
       from branch.customer_class
       where deleted_at is null and is_active = true and status = 'PUBLISHED'`,
    );
    const map = new Map<string, CustomerClassRow>();
    for (const row of result.rows) {
      map.set(row.code as string, row as CustomerClassRow);
    }
    return map;
  }

  async listCustomerClasses() {
    const result = await this.pool.query(
      `select code, label, score_contribution as "scoreContribution",
              urgency_outranks_class as "urgencyOutranksClass",
              definition_source as "definitionSource", notes, status
       from branch.customer_class
       where deleted_at is null
       order by code`,
    );
    return result.rows;
  }

  async qualifiedPool(divisionId: string | null, dueBefore: string | null) {
    const values: unknown[] = [];
    const where = [
      "o.deleted_at is null",
      "o.status = 'OPEN'",
      "o.qual_outcome = 'QUALIFIED'",
      "o.qualified_qty is not null",
    ];
    if (divisionId) {
      values.push(divisionId);
      where.push(`o.division_id = $${values.length}`);
    }
    if (dueBefore) {
      values.push(dueBefore);
      where.push(`o.due_date <= $${values.length}::date`);
    }
    const result = await this.pool.query(
      `select ${POOL_SELECT}
       from branch.delivery_order o
       join branch.material m on m.id = o.material_id
       left join branch.uom u on u.id = o.qualified_qty_uom_id
       where ${where.join(" and ")}
       order by o.due_date asc, o.order_no asc`,
      values,
    );
    return result.rows as Array<{
      id: string;
      orderNo: string;
      customerCode: string;
      customerName: string | null;
      materialId: string;
      materialCode: string;
      materialName?: string;
      storageTankId: string | null;
      isPacked: boolean;
      divisionId: string | null;
      mode: DeliveryMode;
      dueDate: string;
      qualifiedQty: number;
      qualifiedQtyUomId: string;
      qualifiedQtyUomCode: string;
      orderValue: number;
      rankPosition: number | null;
      rankOverrideId: string | null;
    }>;
  }

  async excludedCounts(divisionId: string | null, dueBefore: string | null) {
    const values: unknown[] = [];
    const where = ["deleted_at is null", "status = 'OPEN'"];
    if (divisionId) {
      values.push(divisionId);
      where.push(`division_id = $${values.length}`);
    }
    if (dueBefore) {
      values.push(dueBefore);
      where.push(`due_date <= $${values.length}::date`);
    }
    const result = await this.pool.query(
      `select
         count(*) filter (where qual_outcome = 'FLAGGED')::int as flagged,
         count(*) filter (where qual_outcome = 'CANNOT_EVALUATE')::int as "cannotEvaluate",
         count(*) filter (where qual_outcome not in ('QUALIFIED','FLAGGED','CANNOT_EVALUATE'))::int as other
       from branch.delivery_order
       where ${where.join(" and ")}`,
      values,
    );
    return result.rows[0] as { flagged: number; cannotEvaluate: number; other: number };
  }

  async createRun(
    client: PoolClient,
    args: {
      trigger: RankingTrigger;
      actor: string;
      weightSetId: string;
      weightSetVersionNo: number;
      orderingStrategy: string;
      divisionId: string | null;
      scope: Record<string, unknown>;
      supersedesRunId?: string | null;
    },
  ) {
    const result = await client.query<{ id: string }>(
      `insert into branch.ranking_run (
         trigger, triggered_by, weight_set_id, weight_set_version_no, ordering_strategy,
         division_id, scope_json, supersedes_run_id, status
       ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'RUNNING')
       returning id`,
      [
        args.trigger,
        args.actor,
        args.weightSetId,
        args.weightSetVersionNo,
        args.orderingStrategy,
        args.divisionId,
        JSON.stringify(args.scope),
        args.supersedesRunId ?? null,
      ],
    );
    return result.rows[0]!.id;
  }

  async closeRun(
    client: PoolClient,
    runId: string,
    args: {
      poolSize: number;
      excludedFlagged: number;
      excludedCannotEvaluate: number;
      excludedOther: number;
      totalDemand: number;
      totalDemandUomCode: string | null;
      fallbackClassUsed: number;
      status: "COMPLETED" | "FAILED";
    },
  ) {
    await client.query(
      `update branch.ranking_run set
         pool_size=$2, excluded_flagged=$3, excluded_cannot_evaluate=$4, excluded_other=$5,
         total_demand=$6, total_demand_uom_code=$7, fallback_class_used=$8,
         finished_at=now(), status=$9
       where id=$1`,
      [
        runId,
        args.poolSize,
        args.excludedFlagged,
        args.excludedCannotEvaluate,
        args.excludedOther,
        args.totalDemand,
        args.totalDemandUomCode,
        args.fallbackClassUsed,
        args.status,
      ],
    );
  }

  /**
   * One bulk insert for the whole ranking — a partial list is wrong for M05, unlike M02's per-order txn.
   */
  async insertScores(client: PoolClient, runId: string, ws: WeightSet, rows: ScoredOrder[]) {
    if (!rows.length) return;
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let i = 1;
    for (const row of rows) {
      const slots: string[] = [];
      for (let n = 0; n < 27; n++) slots.push(`$${i++}`);
      placeholders.push(`(${slots.join(",")})`);
      values.push(
        runId,
        row.input.orderId,
        row.rankPosition,
        row.breakdown.total,
        row.breakdown.risk,
        row.breakdown.value,
        row.breakdown.size,
        row.breakdown.class,
        row.breakdown.window,
        row.input.runOutDays,
        row.input.riskBand,
        row.input.orderValue,
        row.input.qualifiedQty,
        row.input.qtyUomId,
        row.breakdown.normalisedQty,
        row.input.customerClass,
        row.input.customerSegment,
        row.breakdown.classSource,
        row.input.mode,
        ws.id,
        ws.versionNo,
        ws.orderingStrategy,
        row.input.isPacked,
        row.rankSource,
        row.overrideId,
        row.grounds,
        row.reference,
      );
    }

    await client.query(
      `insert into branch.order_rank_score (
         run_id, order_id, rank_position, total_score,
         risk_score, value_score, size_score, class_score, window_score,
         input_run_out_days, input_risk_band, input_order_value, input_qualified_qty,
         input_qty_uom_id, input_normalised_qty, input_customer_class, input_customer_segment,
         class_source, input_mode, weight_set_id, weight_set_version_no, ordering_strategy,
         is_packed, rank_source, override_id, grounds, reference
       ) values ${placeholders.join(",")}`,
      values,
    );
  }

  async applyRankPositions(client: PoolClient, rows: ScoredOrder[]) {
    for (const row of rows) {
      await client.query(
        `update branch.delivery_order set
           rank_position=$2,
           rank_override_id=coalesce($3, rank_override_id),
           updated_at=now(), updated_by=coalesce($4, updated_by)
         where id=$1 and deleted_at is null`,
        [row.input.orderId, row.rankPosition, row.overrideId, null],
      );
    }
  }

  async setOrderOverride(client: PoolClient, orderId: string, overrideId: string, actor: string) {
    await client.query(
      `update branch.delivery_order set rank_override_id=$2, updated_at=now(), updated_by=$3
       where id=$1 and deleted_at is null`,
      [orderId, overrideId, actor],
    );
  }

  async writeAudit(
    client: PoolClient,
    orderId: string,
    action: string,
    actor: string,
    note: string | null,
    payload: Record<string, unknown> | null,
  ) {
    await client.query(
      `insert into branch.delivery_order_audit (delivery_order_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [orderId, action, actor, note, payload ? JSON.stringify(payload) : null],
    );
  }

  async latestCompletedRun(divisionId: string | null) {
    const values: unknown[] = [];
    const where = ["status = 'COMPLETED'"];
    if (divisionId) {
      values.push(divisionId);
      where.push(`(division_id = $${values.length} or division_id is null)`);
    }
    const result = await this.pool.query(
      `select id, trigger, triggered_by as "triggeredBy", weight_set_id as "weightSetId",
              weight_set_version_no as "weightSetVersionNo", ordering_strategy as "orderingStrategy",
              division_id as "divisionId", pool_size as "poolSize",
              excluded_flagged as "excludedFlagged",
              excluded_cannot_evaluate as "excludedCannotEvaluate",
              excluded_other as "excludedOther",
              total_demand::float8 as "totalDemand", total_demand_uom_code as "totalDemandUomCode",
              fallback_class_used as "fallbackClassUsed",
              supersedes_run_id as "supersedesRunId",
              started_at as "startedAt", finished_at as "finishedAt", status, scope_json as "scopeJson"
       from branch.ranking_run
       where ${where.join(" and ")}
       order by started_at desc
       limit 1`,
      values,
    );
    return result.rows[0] ?? null;
  }

  async findRun(id: string) {
    const result = await this.pool.query(
      `select id, trigger, triggered_by as "triggeredBy", weight_set_id as "weightSetId",
              weight_set_version_no as "weightSetVersionNo", ordering_strategy as "orderingStrategy",
              division_id as "divisionId", pool_size as "poolSize",
              excluded_flagged as "excludedFlagged",
              excluded_cannot_evaluate as "excludedCannotEvaluate",
              excluded_other as "excludedOther",
              total_demand::float8 as "totalDemand", total_demand_uom_code as "totalDemandUomCode",
              fallback_class_used as "fallbackClassUsed",
              supersedes_run_id as "supersedesRunId",
              started_at as "startedAt", finished_at as "finishedAt", status, scope_json as "scopeJson"
       from branch.ranking_run where id=$1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async listRuns(page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.ranking_run`,
    );
    const result = await this.pool.query(
      `select id, trigger, triggered_by as "triggeredBy", weight_set_id as "weightSetId",
              weight_set_version_no as "weightSetVersionNo", ordering_strategy as "orderingStrategy",
              division_id as "divisionId", pool_size as "poolSize",
              total_demand::float8 as "totalDemand", total_demand_uom_code as "totalDemandUomCode",
              fallback_class_used as "fallbackClassUsed",
              started_at as "startedAt", finished_at as "finishedAt", status
       from branch.ranking_run
       order by started_at desc
       limit $1 offset $2`,
      [pageSize, offset],
    );
    return { rows: result.rows, total: Number(count.rows[0]?.total ?? 0) };
  }

  async scoresForRun(runId: string) {
    const result = await this.pool.query(
      `select s.id, s.run_id as "runId", s.order_id as "orderId", o.order_no as "orderNo",
              o.customer_code as "customerCode", o.customer_name as "customerName",
              o.material_id as "materialId", m.code as "materialCode",
              o.mode, o.due_date::text as "dueDate", o.is_packed as "isPacked",
              s.rank_position as "rankPosition", s.total_score::float8 as "totalScore",
              s.risk_score::float8 as "riskScore", s.value_score::float8 as "valueScore",
              s.size_score::float8 as "sizeScore", s.class_score::float8 as "classScore",
              s.window_score::float8 as "windowScore",
              s.input_run_out_days::float8 as "runOutDays", s.input_risk_band as "riskBand",
              s.input_order_value::float8 as "orderValue",
              s.input_qualified_qty::float8 as "qualifiedQty",
              s.input_qty_uom_id as "qtyUomId",
              s.input_normalised_qty::float8 as "normalisedQty",
              s.input_customer_class as "customerClass",
              s.input_customer_segment as "customerSegment",
              s.class_source as "classSource", s.input_mode as "inputMode",
              s.rank_source as "rankSource", s.override_id as "overrideId",
              s.grounds, s.reference, s.scored_at as "scoredAt"
       from branch.order_rank_score s
       join branch.delivery_order o on o.id = s.order_id
       join branch.material m on m.id = o.material_id
       where s.run_id=$1
       order by s.rank_position asc`,
      [runId],
    );
    return result.rows;
  }

  async scoresForOrder(orderId: string) {
    const result = await this.pool.query(
      `select s.id, s.run_id as "runId", s.rank_position as "rankPosition",
              s.total_score::float8 as "totalScore",
              s.risk_score::float8 as "riskScore", s.value_score::float8 as "valueScore",
              s.size_score::float8 as "sizeScore", s.class_score::float8 as "classScore",
              s.window_score::float8 as "windowScore",
              s.input_risk_band as "riskBand", s.class_source as "classSource",
              s.rank_source as "rankSource", s.scored_at as "scoredAt",
              r.started_at as "runStartedAt", r.trigger
       from branch.order_rank_score s
       join branch.ranking_run r on r.id = s.run_id
       where s.order_id=$1
       order by s.scored_at desc`,
      [orderId],
    );
    return result.rows;
  }

  async isRunCurrent(runId: string, divisionId: string | null) {
    const latest = await this.latestCompletedRun(divisionId);
    return latest?.id === runId;
  }

  async orderExists(id: string) {
    const result = await this.pool.query(
      `select id from branch.delivery_order where id=$1 and deleted_at is null`,
      [id],
    );
    if (!result.rows[0]) throw new MdmError("NOT_FOUND", "Order was not found", 404);
  }
}

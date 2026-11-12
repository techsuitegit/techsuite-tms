import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { GateResult, QualificationPolicy, TankReadingSnapshot } from "../services/qualification-types";

const ORDER_SELECT = `
  o.id, o.order_no as "orderNo", o.customer_code as "customerCode", o.customer_name as "customerName",
  o.material_id as "materialId", m.code as "materialCode", m.name as "materialName",
  o.storage_tank_id as "storageTankId", o.is_packed as "isPacked",
  o.shipping_point_id as "shippingPointId", o.division_id as "divisionId",
  o.mode, o.due_date::text as "dueDate",
  o.requested_qty::float8 as "requestedQty", o.requested_qty_uom_id as "requestedQtyUomId",
  o.qualified_qty::float8 as "qualifiedQty", o.qualified_qty_uom_id as "qualifiedQtyUomId",
  o.computed_ullage::float8 as "computedUllage", o.computed_ullage_uom_id as "computedUllageUomId",
  o.order_value::float8 as "orderValue", o.status,
  o.qual_outcome as "qualOutcome", o.qual_mode as "qualMode",
  o.qual_reason_code as "qualReasonCode", o.qual_reason_text as "qualReasonText",
  o.qual_decided_at as "qualDecidedAt", o.qual_decided_by as "qualDecidedBy",
  o.qual_decision_id as "qualDecisionId", o.qual_last_run_id as "qualLastRunId",
  o.override_id as "overrideId", o.version_no as "versionNo"
`;

export class QualificationRepository {
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
      `select pg_try_advisory_lock(hashtext('m02_qualification_run')) as locked`,
    );
    return Boolean(result.rows[0]?.locked);
  }

  async releaseRunLock(client: PoolClient) {
    await client.query(`select pg_advisory_unlock(hashtext('m02_qualification_run'))`);
  }

  async currentPolicy(): Promise<QualificationPolicy> {
    const result = await this.pool.query(
      `select id, code, name,
              staleness_threshold_hours as "stalenessThresholdHours",
              ullage_formula as "ullageFormula",
              min_evaluable_ullage::float8 as "minEvaluableUllage"
       from branch.qualification_policy
       where deleted_at is null and status = 'PUBLISHED'
       order by updated_at desc
       limit 1`,
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("CONFLICT", "No published qualification policy", 409);
    return row as QualificationPolicy;
  }

  async listReasonCodes(appliesTo: string | null) {
    const values: unknown[] = [];
    const where = ["is_active = true"];
    if (appliesTo) {
      values.push(appliesTo);
      where.push(`applies_to = $${values.length}`);
    }
    const result = await this.pool.query(
      `select code, label, applies_to as "appliesTo", typical_outcome as "typicalOutcome", is_active as "isActive"
       from branch.qualification_reason_code
       where ${where.join(" and ")}
       order by code`,
      values,
    );
    return result.rows;
  }

  async findReasonCode(code: string) {
    const result = await this.pool.query(
      `select code, label, applies_to as "appliesTo", typical_outcome as "typicalOutcome", is_active as "isActive"
       from branch.qualification_reason_code where code=$1`,
      [code],
    );
    return result.rows[0] ?? null;
  }

  async drawRateMap(): Promise<Map<string, number>> {
    const result = await this.pool.query<{ material_code: string | null; draw_rate_per_day: string }>(
      `select material_code, draw_rate_per_day::text
       from branch.product_draw_rate
       where deleted_at is null and status = 'PUBLISHED'`,
    );
    const map = new Map<string, number>();
    for (const row of result.rows) {
      const key = row.material_code ? row.material_code.toUpperCase() : "__DEFAULT__";
      map.set(key, Number(row.draw_rate_per_day));
    }
    return map;
  }

  async findOrder(id: string) {
    const result = await this.pool.query(
      `select ${ORDER_SELECT}
       from branch.delivery_order o
       join branch.material m on m.id = o.material_id
       where o.id=$1 and o.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async lockOrder(client: PoolClient, id: string) {
    const result = await client.query(
      `select id, status, version_no as "versionNo",
              qual_outcome as "qualOutcome", qual_mode as "qualMode",
              is_packed as "isPacked", storage_tank_id as "storageTankId",
              requested_qty::float8 as "requestedQty",
              requested_qty_uom_id as "requestedQtyUomId",
              material_id as "materialId"
       from branch.delivery_order
       where id=$1 and deleted_at is null
       for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "Order was not found", 404);
    return row as Record<string, unknown>;
  }

  async listQueue(query: {
    q: string;
    outcomes: string[];
    mode: string | null;
    page: number;
    pageSize: number;
  }) {
    const offset = (query.page - 1) * query.pageSize;
    const values: unknown[] = [];
    const where = ["o.deleted_at is null", "o.status = 'OPEN'"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(o.order_no ilike $${values.length} or o.customer_code ilike $${values.length})`);
    }
    if (query.outcomes.length) {
      values.push(query.outcomes);
      where.push(`o.qual_outcome = any($${values.length}::text[])`);
    }
    if (query.mode) {
      values.push(query.mode);
      where.push(`o.mode = $${values.length}`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.delivery_order o where ${where.join(" and ")}`,
      values,
    );
    values.push(query.pageSize, offset);
    const result = await this.pool.query(
      `select ${ORDER_SELECT}
       from branch.delivery_order o
       join branch.material m on m.id = o.material_id
       where ${where.join(" and ")}
       order by o.due_date asc, o.order_no asc
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    const counts = await this.pool.query(
      `select
         count(*) filter (where qual_outcome = 'QUALIFIED' and qual_mode = 'AUTO')::int as "autoQualified",
         count(*) filter (where qual_outcome = 'FLAGGED')::int as flagged,
         count(*) filter (where qual_outcome = 'CANNOT_EVALUATE')::int as "cannotEvaluate",
         count(*) filter (where qual_mode = 'MANUAL')::int as manual
       from branch.delivery_order
       where deleted_at is null and status = 'OPEN'`,
    );
    return {
      rows: result.rows,
      total: Number(count.rows[0]?.total ?? 0),
      counts: counts.rows[0] ?? { autoQualified: 0, flagged: 0, cannotEvaluate: 0, manual: 0 },
    };
  }

  async scopeOrderIds(dueBefore: string | null, divisionId: string | null) {
    const values: unknown[] = [];
    const where = [
      "deleted_at is null",
      "status = 'OPEN'",
      "qual_outcome in ('PENDING','FLAGGED','CANNOT_EVALUATE')",
      "(qual_mode is null or qual_mode <> 'MANUAL')",
    ];
    if (dueBefore) {
      values.push(dueBefore);
      where.push(`due_date <= $${values.length}::date`);
    }
    if (divisionId) {
      values.push(divisionId);
      where.push(`division_id = $${values.length}`);
    }
    const result = await this.pool.query<{ id: string }>(
      `select id from branch.delivery_order
       where ${where.join(" and ")}
       order by due_date asc`,
      values,
    );
    const skipped = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.delivery_order
       where deleted_at is null and status = 'OPEN'
         and (
           qual_mode = 'MANUAL'
           or qual_outcome in ('QUALIFIED','REJECTED')
         )`,
    );
    return { ids: result.rows.map((r) => r.id), skippedCount: Number(skipped.rows[0]?.total ?? 0) };
  }

  async snapshotsForTanks(tankIds: string[]): Promise<Map<string, TankReadingSnapshot>> {
    const map = new Map<string, TankReadingSnapshot>();
    if (!tankIds.length) return map;
    const result = await this.pool.query(
      `select storage_tank_id as "tankId",
              usable_capacity::float8 as "usableCapacity",
              target_fill_pct::float8 as "targetFillPct",
              level_pct::float8 as "levelPct",
              dead_stock::float8 as "deadStock",
              reading_source as "readingSource",
              case when level_as_of is null then null
                   else extract(epoch from (now() - level_as_of)) / 3600.0
              end::float8 as "readingAgeHours",
              uom_id as "uomId"
       from branch.tank_reading_snapshot
       where storage_tank_id = any($1::text[])`,
      [tankIds],
    );
    for (const row of result.rows) {
      map.set(row.tankId, row as TankReadingSnapshot);
    }
    return map;
  }

  async upsertTankReading(
    tankId: string,
    input: {
      usableCapacity: number;
      targetFillPct: number;
      levelPct: number;
      deadStock: number;
      readingSource: string;
      levelAsOf: string | null;
      uomId: string;
    },
    actor: string,
  ) {
    await this.pool.query(
      `insert into branch.tank_reading_snapshot (
         storage_tank_id, usable_capacity, target_fill_pct, level_pct, dead_stock,
         reading_source, level_as_of, uom_id, updated_by
       ) values ($1,$2,$3,$4,$5,$6, coalesce($7::timestamptz, now()), $8, $9)
       on conflict (storage_tank_id) do update set
         usable_capacity = excluded.usable_capacity,
         target_fill_pct = excluded.target_fill_pct,
         level_pct = excluded.level_pct,
         dead_stock = excluded.dead_stock,
         reading_source = excluded.reading_source,
         level_as_of = excluded.level_as_of,
         uom_id = excluded.uom_id,
         updated_at = now(),
         updated_by = excluded.updated_by`,
      [
        tankId,
        input.usableCapacity,
        input.targetFillPct,
        input.levelPct,
        input.deadStock,
        input.readingSource,
        input.levelAsOf,
        input.uomId,
        actor,
      ],
    );
  }

  async createRun(
    client: PoolClient,
    trigger: string,
    actor: string | null,
    policyId: string,
    scope: Record<string, unknown> | null,
  ) {
    const result = await client.query(
      `insert into branch.qualification_run (trigger, triggered_by, policy_id, scope_json, status)
       values ($1,$2,$3,$4::jsonb,'RUNNING')
       returning id`,
      [trigger, actor, policyId, scope ? JSON.stringify(scope) : null],
    );
    return result.rows[0].id as string;
  }

  async closeRun(
    client: PoolClient,
    runId: string,
    counters: {
      scanned: number;
      skipped: number;
      qualified: number;
      flagged: number;
      cannotEvaluate: number;
      auditEvents: number;
      errors: number;
      status: "COMPLETED" | "FAILED";
    },
  ) {
    await client.query(
      `update branch.qualification_run set
         finished_at = now(),
         scanned_count = $2,
         skipped_count = $3,
         qualified_count = $4,
         flagged_count = $5,
         cannot_evaluate_count = $6,
         audit_events_written = $7,
         error_count = $8,
         status = $9
       where id = $1`,
      [
        runId,
        counters.scanned,
        counters.skipped,
        counters.qualified,
        counters.flagged,
        counters.cannotEvaluate,
        counters.auditEvents,
        counters.errors,
        counters.status,
      ],
    );
  }

  async insertDecision(
    client: PoolClient,
    args: {
      orderId: string;
      runId: string | null;
      source: "ENGINE" | "PLANNER";
      result: GateResult | {
        outcome: string;
        gateReached: number;
        failedGate: number | null;
        reasonCode: string;
        reasonText: string;
        ullage: number | null;
        qualifiedQty: number | null;
        inputs: GateResult["inputs"];
      };
      runOutDays: number | null;
      riskBand: string | null;
      uomId: string;
      policyId: string;
      stalenessHours: number;
      actor: string | null;
      overrideId: string | null;
      grounds: string | null;
      reference: string | null;
      auditEventWritten: boolean;
    },
  ) {
    const r = args.result;
    const result = await client.query(
      `insert into branch.order_qualification_decision (
         order_id, run_id, decision_source, outcome, gate_reached, failed_gate,
         reason_code, reason_text,
         input_usable_capacity, input_target_fill_pct, input_level_pct, input_dead_stock,
         input_reading_source, input_reading_age_hours, input_requested_qty,
         computed_ullage, computed_run_out_days, computed_risk_band,
         uom_id, staleness_threshold_hours, policy_id, qualified_qty,
         decided_by, override_id, grounds, reference, audit_event_written
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
       ) returning id, decided_at as "decidedAt"`,
      [
        args.orderId,
        args.runId,
        args.source,
        r.outcome,
        r.gateReached,
        r.failedGate,
        r.reasonCode,
        r.reasonText,
        r.inputs.usableCapacity,
        r.inputs.targetFillPct,
        r.inputs.levelPct,
        r.inputs.deadStock,
        r.inputs.readingSource,
        r.inputs.readingAgeHours,
        r.inputs.requestedQty,
        r.ullage,
        args.runOutDays,
        args.riskBand,
        args.uomId,
        args.stalenessHours,
        args.policyId,
        r.qualifiedQty,
        args.actor,
        args.overrideId,
        args.grounds,
        args.reference,
        args.auditEventWritten,
      ],
    );
    return result.rows[0] as { id: string; decidedAt: string };
  }

  async applyOutcome(
    client: PoolClient,
    orderId: string,
    args: {
      outcome: string;
      mode: string | null;
      reasonCode: string;
      reasonText: string;
      qualifiedQty: number | null;
      qualifiedQtyUomId: string | null;
      ullage: number | null;
      ullageUomId: string | null;
      decisionId: string;
      runId: string | null;
      overrideId: string | null;
      actor: string | null;
    },
  ) {
    await client.query(
      `update branch.delivery_order set
         qual_outcome = $2,
         qual_mode = $3,
         qual_reason_code = $4,
         qual_reason_text = $5,
         qualified_qty = $6,
         qualified_qty_uom_id = $7,
         computed_ullage = $8,
         computed_ullage_uom_id = $9,
         qual_decision_id = $10,
         qual_last_run_id = coalesce($11, qual_last_run_id),
         override_id = coalesce($12, override_id),
         qual_decided_at = now(),
         qual_decided_by = $13,
         version_no = version_no + 1,
         updated_at = now(),
         updated_by = coalesce($13, updated_by)
       where id = $1`,
      [
        orderId,
        args.outcome,
        args.mode,
        args.reasonCode,
        args.reasonText,
        args.qualifiedQty,
        args.qualifiedQtyUomId,
        args.ullage,
        args.ullageUomId,
        args.decisionId,
        args.runId,
        args.overrideId,
        args.actor,
      ],
    );
  }

  async lastFlaggedDecision(orderId: string) {
    const result = await this.pool.query(
      `select id, reason_text as "reasonText", audit_event_written as "auditEventWritten", outcome
       from branch.order_qualification_decision
       where order_id=$1 and outcome='FLAGGED'
       order by decided_at desc
       limit 1`,
      [orderId],
    );
    return result.rows[0] ?? null;
  }

  async lastCannotEvaluateDecision(orderId: string) {
    const result = await this.pool.query(
      `select id, reason_text as "reasonText", audit_event_written as "auditEventWritten", outcome
       from branch.order_qualification_decision
       where order_id=$1 and outcome='CANNOT_EVALUATE'
       order by decided_at desc
       limit 1`,
      [orderId],
    );
    return result.rows[0] ?? null;
  }

  async auditOrder(
    client: PoolClient,
    orderId: string,
    action: string,
    actor: string | null,
    note: string | null,
    payload: Record<string, unknown> | null,
  ) {
    await client.query(
      `insert into branch.delivery_order_audit (delivery_order_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [orderId, action, actor, note, payload ? JSON.stringify(payload) : null],
    );
  }

  async listDecisions(orderId: string) {
    const result = await this.pool.query(
      `select id, order_id as "orderId", run_id as "runId", decision_source as "decisionSource",
              outcome, gate_reached as "gateReached", failed_gate as "failedGate",
              reason_code as "reasonCode", reason_text as "reasonText",
              input_usable_capacity::float8 as "inputUsableCapacity",
              input_target_fill_pct::float8 as "inputTargetFillPct",
              input_level_pct::float8 as "inputLevelPct",
              input_dead_stock::float8 as "inputDeadStock",
              input_reading_source as "inputReadingSource",
              input_reading_age_hours::float8 as "inputReadingAgeHours",
              input_requested_qty::float8 as "inputRequestedQty",
              computed_ullage::float8 as "computedUllage",
              computed_run_out_days::float8 as "computedRunOutDays",
              computed_risk_band as "computedRiskBand",
              uom_id as "uomId",
              staleness_threshold_hours as "stalenessThresholdHours",
              policy_id as "policyId",
              qualified_qty::float8 as "qualifiedQty",
              decided_at as "decidedAt", decided_by as "decidedBy",
              override_id as "overrideId", grounds, reference,
              audit_event_written as "auditEventWritten"
       from branch.order_qualification_decision
       where order_id=$1
       order by decided_at desc`,
      [orderId],
    );
    return result.rows;
  }

  async listRuns(page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.qualification_run`,
    );
    const result = await this.pool.query(
      `select id, trigger, triggered_by as "triggeredBy", policy_id as "policyId",
              started_at as "startedAt", finished_at as "finishedAt",
              scanned_count as "scannedCount", skipped_count as "skippedCount",
              qualified_count as "qualifiedCount", flagged_count as "flaggedCount",
              cannot_evaluate_count as "cannotEvaluateCount",
              audit_events_written as "auditEventsWritten",
              error_count as "errorCount", status, scope_json as "scope"
       from branch.qualification_run
       order by started_at desc
       limit $1 offset $2`,
      [pageSize, offset],
    );
    return { rows: result.rows, total: Number(count.rows[0]?.total ?? 0) };
  }

  async findRun(id: string) {
    const result = await this.pool.query(
      `select id, trigger, triggered_by as "triggeredBy", policy_id as "policyId",
              started_at as "startedAt", finished_at as "finishedAt",
              scanned_count as "scannedCount", skipped_count as "skippedCount",
              qualified_count as "qualifiedCount", flagged_count as "flaggedCount",
              cannot_evaluate_count as "cannotEvaluateCount",
              audit_events_written as "auditEventsWritten",
              error_count as "errorCount", status, scope_json as "scope"
       from branch.qualification_run where id=$1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async decisionsForRun(runId: string) {
    const result = await this.pool.query(
      `select id, order_id as "orderId", outcome, reason_code as "reasonCode",
              reason_text as "reasonText", decided_at as "decidedAt"
       from branch.order_qualification_decision
       where run_id=$1
       order by decided_at desc`,
      [runId],
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
      `select ${ORDER_SELECT}
       from branch.delivery_order o
       join branch.material m on m.id = o.material_id
       where ${where.join(" and ")}
       order by o.due_date asc`,
      values,
    );
    return result.rows;
  }

  async tankSafeFillAndUom(tankId: string) {
    const result = await this.pool.query(
      `select id, safe_fill_l::float8 as "safeFillL", capacity_uom_id as "capacityUomId"
       from branch.storage_tank where id=$1 and deleted_at is null`,
      [tankId],
    );
    return result.rows[0] ?? null;
  }
}

import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { OrderInput } from "../services/order-types";

const SELECT_LIST = `
  o.id, o.order_no as "orderNo", o.external_id as "externalId",
  o.customer_code as "customerCode", o.customer_name as "customerName",
  o.material_id as "materialId", m.code as "materialCode", m.name as "materialName",
  o.storage_tank_id as "storageTankId", st.code as "storageTankCode",
  o.shipping_point_id as "shippingPointId", sp.code as "shippingPointCode",
  o.division_id as "divisionId", d.code as "divisionCode",
  o.is_packed as "isPacked", o.mode, o.due_date::text as "dueDate",
  o.requested_qty::float8 as "requestedQty", o.requested_qty_uom_id as "requestedQtyUomId",
  u.code as "requestedQtyUomCode",
  o.qualified_qty::float8 as "qualifiedQty", o.qualified_qty_uom_id as "qualifiedQtyUomId",
  o.computed_ullage::float8 as "computedUllage", o.computed_ullage_uom_id as "computedUllageUomId",
  o.order_value::float8 as "orderValue",
  o.status, o.qual_outcome as "qualOutcome", o.qual_mode as "qualMode",
  o.qual_reason_code as "qualReasonCode", o.qual_reason_text as "qualReasonText",
  o.qual_decided_at as "qualDecidedAt", o.qual_decided_by as "qualDecidedBy",
  o.notes, o.version_no as "versionNo",
  o.created_at as "createdAt", o.updated_at as "updatedAt"
`;

const FROM_JOINS = `
  from branch.delivery_order o
  join branch.material m on m.id = o.material_id
  join branch.uom u on u.id = o.requested_qty_uom_id
  left join branch.storage_tank st on st.id = o.storage_tank_id
  left join branch.shipping_point sp on sp.id = o.shipping_point_id
  left join branch.division d on d.id = o.division_id
`;

const SORT_COLUMNS: Record<string, string> = {
  orderNo: "o.order_no",
  dueDate: "o.due_date",
  status: "o.status",
  qualOutcome: "o.qual_outcome",
  updatedAt: "o.updated_at",
};

export type OrderRow = {
  id: string;
  status: string;
  version_no: number;
  qual_outcome: string;
};

export type OrderListQuery = {
  q: string;
  status: string | null;
  qualOutcome: string | null;
  mode: string | null;
  dueFrom: string | null;
  dueTo: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class OrderRepository {
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

  async list(query: OrderListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["o.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(
        `(o.order_no ilike $${values.length} or o.customer_code ilike $${values.length} or coalesce(o.external_id,'') ilike $${values.length})`,
      );
    }
    if (query.status) {
      values.push(query.status);
      where.push(`o.status = $${values.length}`);
    }
    if (query.qualOutcome) {
      values.push(query.qualOutcome);
      where.push(`o.qual_outcome = $${values.length}`);
    }
    if (query.mode) {
      values.push(query.mode);
      where.push(`o.mode = $${values.length}`);
    }
    if (query.dueFrom) {
      values.push(query.dueFrom);
      where.push(`o.due_date >= $${values.length}::date`);
    }
    if (query.dueTo) {
      values.push(query.dueTo);
      where.push(`o.due_date <= $${values.length}::date`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.delivery_order o where ${where.join(" and ")}`,
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
      `select ${SELECT_LIST} ${FROM_JOINS} where o.id=$1 and o.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findByExternalId(externalId: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS} where o.external_id=$1 and o.deleted_at is null`,
      [externalId],
    );
    return result.rows[0] ?? null;
  }

  async findByOrderNo(orderNo: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS} where upper(o.order_no)=upper($1) and o.deleted_at is null`,
      [orderNo],
    );
    return result.rows[0] ?? null;
  }

  async findPublishedParent(table: string, id: string) {
    const allowed = new Set(["material", "uom", "storage_tank", "shipping_point", "division"]);
    if (!allowed.has(table)) throw new Error(`invalid parent table ${table}`);
    const result = await this.pool.query<{ id: string; status: string; code: string }>(
      `select id, status, code from branch.${table} where id=$1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findPublishedByCode(table: string, code: string) {
    const allowed = new Set(["material", "uom", "storage_tank", "shipping_point", "division"]);
    if (!allowed.has(table)) throw new Error(`invalid parent table ${table}`);
    const result = await this.pool.query<{ id: string; status: string; code: string }>(
      `select id, status, code from branch.${table}
       where upper(code)=upper($1) and deleted_at is null and status='PUBLISHED'
       limit 1`,
      [code],
    );
    return result.rows[0] ?? null;
  }

  async lock(client: PoolClient, id: string): Promise<OrderRow> {
    const result = await client.query<OrderRow>(
      `select id, status, version_no, qual_outcome
       from branch.delivery_order where id=$1 and deleted_at is null for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "Order was not found", 404);
    return row;
  }

  async insert(client: PoolClient, input: OrderInput, actor: string, id: string) {
    const result = await client.query(
      `insert into branch.delivery_order (
         id, order_no, external_id, customer_code, customer_name,
         material_id, storage_tank_id, shipping_point_id, division_id,
         is_packed, mode, due_date, requested_qty, requested_qty_uom_id,
         order_value, status, qual_outcome, notes,
         version_no, created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13,$14,$15,
         'OPEN','PENDING',$16,1,$17,$17
       )
       returning id, version_no as "versionNo", status`,
      [
        id,
        input.orderNo,
        input.externalId,
        input.customerCode,
        input.customerName,
        input.materialId,
        input.storageTankId,
        input.shippingPointId,
        input.divisionId,
        input.isPacked,
        input.mode,
        input.dueDate,
        input.requestedQty,
        input.requestedQtyUomId,
        input.orderValue,
        input.notes,
        actor,
      ],
    );
    return result.rows[0] as { id: string; versionNo: number; status: string };
  }

  async update(client: PoolClient, id: string, input: OrderInput, actor: string) {
    await client.query(
      `update branch.delivery_order set
         order_no=$2, external_id=$3, customer_code=$4, customer_name=$5,
         material_id=$6, storage_tank_id=$7, shipping_point_id=$8, division_id=$9,
         is_packed=$10, mode=$11, due_date=$12::date,
         requested_qty=$13, requested_qty_uom_id=$14, order_value=$15,
         notes=$16, version_no=version_no+1, updated_at=now(), updated_by=$17
       where id=$1 and deleted_at is null`,
      [
        id,
        input.orderNo,
        input.externalId,
        input.customerCode,
        input.customerName,
        input.materialId,
        input.storageTankId,
        input.shippingPointId,
        input.divisionId,
        input.isPacked,
        input.mode,
        input.dueDate,
        input.requestedQty,
        input.requestedQtyUomId,
        input.orderValue,
        input.notes,
        actor,
      ],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, actor: string) {
    await client.query(
      `update branch.delivery_order set
         status=$2, version_no=version_no+1, updated_at=now(), updated_by=$3
       where id=$1 and deleted_at is null`,
      [id, status, actor],
    );
  }

  async softDelete(client: PoolClient, id: string, actor: string) {
    await client.query(
      `update branch.delivery_order set
         deleted_at=now(), updated_at=now(), updated_by=$2, version_no=version_no+1
       where id=$1 and deleted_at is null`,
      [id, actor],
    );
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.delivery_order_version (delivery_order_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(o.*), $2
       from branch.delivery_order o where id=$1`,
      [id, actor],
    );
  }

  async audit(
    client: PoolClient,
    id: string,
    action: string,
    actor: string,
    note: string | null,
    payload: Record<string, unknown> | null,
  ) {
    await client.query(
      `insert into branch.delivery_order_audit (delivery_order_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, payload ? JSON.stringify(payload) : null],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select id, version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.delivery_order_version where delivery_order_id=$1
       order by version_no desc`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select id, action, actor, note, payload, created_at as "createdAt"
       from branch.delivery_order_audit where delivery_order_id=$1
       order by created_at desc`,
      [id],
    );
    return result.rows;
  }

  async exportRows() {
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS}
       where o.deleted_at is null
       order by o.updated_at desc
       limit 5000`,
    );
    return result.rows;
  }

  async lookups() {
    const [materials, uoms, tanks, shippingPoints, divisions] = await Promise.all([
      this.pool.query(
        `select id, code, name from branch.material where deleted_at is null and status='PUBLISHED' order by code`,
      ),
      this.pool.query(
        `select id, code, name from branch.uom where deleted_at is null and status='PUBLISHED' order by code`,
      ),
      this.pool.query(
        `select id, code, name from branch.storage_tank where deleted_at is null and status='PUBLISHED' order by code`,
      ),
      this.pool.query(
        `select id, code, name from branch.shipping_point where deleted_at is null and status='PUBLISHED' order by code`,
      ),
      this.pool.query(
        `select id, code, name from branch.division where deleted_at is null and status='PUBLISHED' order by code`,
      ),
    ]);
    return {
      materials: materials.rows,
      uoms: uoms.rows,
      storageTanks: tanks.rows,
      shippingPoints: shippingPoints.rows,
      divisions: divisions.rows,
      modes: ["FORECAST", "MONITOR", "SCHEDULED", "WILL_CALL"],
      statuses: ["OPEN", "CANCELLED", "CLOSED"],
      qualOutcomes: ["PENDING", "QUALIFIED", "FLAGGED", "CANNOT_EVALUATE", "REJECTED"],
    };
  }
}

export function mapDbError(error: unknown) {
  if (error instanceof MdmError) return error;
  const err = error as { code?: string; constraint?: string; message?: string };
  if (err.code === "23505") {
    if (err.constraint?.includes("order_no")) {
      return new MdmError("CONFLICT", "orderNo already exists", 409, "orderNo");
    }
    if (err.constraint?.includes("external_id")) {
      return new MdmError("CONFLICT", "externalId already exists", 409, "externalId");
    }
    return new MdmError("CONFLICT", "duplicate key", 409);
  }
  if (err.code === "23503") {
    return new MdmError("VALIDATION", "referenced parent was not found", 400);
  }
  if (err.code === "23514") {
    return new MdmError("VALIDATION", err.message ?? "check constraint failed", 400);
  }
  return error instanceof Error ? error : new Error(String(error));
}

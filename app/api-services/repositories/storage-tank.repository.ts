import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { StorageTankInput } from "../services/storage-tank-types";

const SELECT_LIST = `
  t.id, t.code, t.name, t.ownership,
  t.material_id as "materialId", m.code as "materialCode", m.name as "materialName",
  t.legal_entity_id as "legalEntityId",
  t.shipping_point_id as "shippingPointId", sp.code as "shippingPointCode", sp.name as "shippingPointName",
  t.customer_code as "customerCode",
  t.vendor_id as "vendorId", v.code as "vendorCode", v.name as "vendorName",
  t.dispatcher_point_id as "dispatcherPointId", dp.code as "dispatcherPointCode", dp.name as "dispatcherPointName",
  t.capacity_l::float8 as "capacityL", t.safe_fill_l::float8 as "safeFillL",
  t.safety_stock_l::float8 as "safetyStockL", t.reorder_l::float8 as "reorderL",
  t.capacity_uom_id as "capacityUomId", cu.code as "capacityUomCode",
  t.gauge_type as "gaugeType", t.gauge_device_ref as "gaugeDeviceRef",
  t.last_calibration::text as "lastCalibration", t.inspection_due::text as "inspectionDue",
  t.certificate,
  t.valid_from::text as "validFrom", t.valid_to::text as "validTo",
  t.reason, t.change_note as "changeNote",
  t.status, t.version_no as "versionNo", t.external_id as "externalId",
  t.created_at as "createdAt", t.updated_at as "updatedAt"
`;

const FROM = `
  from branch.storage_tank t
  join branch.material m on m.id = t.material_id
  left join branch.shipping_point sp on sp.id = t.shipping_point_id
  left join branch.vendor v on v.id = t.vendor_id
  left join branch.shipping_point dp on dp.id = t.dispatcher_point_id
  left join branch.uom cu on cu.id = t.capacity_uom_id
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "t.code",
  name: "t.name",
  status: "t.status",
  validFrom: "t.valid_from",
  updatedAt: "t.updated_at",
};

export type StorageTankRow = { id: string; status: string; version_no: number; code: string };

export type StorageTankListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class StorageTankRepository {
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

  async list(query: StorageTankListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["t.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(t.code ilike $${values.length} or t.name ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`t.status = $${values.length}`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.storage_tank t where ${where.join(" and ")}`,
      values,
    );
    values.push(query.pageSize, offset);
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM} where ${where.join(" and ")}
       order by ${sortCol} asc
       limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { rows: result.rows, total: Number(count.rows[0]?.total ?? 0) };
  }

  async findById(id: string) {
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM} where t.id=$1 and t.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async lock(client: PoolClient, id: string): Promise<StorageTankRow> {
    const result = await client.query<StorageTankRow>(
      `select id, status, version_no, code from branch.storage_tank where id=$1 and deleted_at is null for update`,
      [id],
    );
    if (!result.rows[0]) throw new MdmError("NOT_FOUND", "Storage Tank was not found", 404);
    return result.rows[0];
  }

  async findPublished(table: "material" | "shipping_point", id: string) {
    const result = await this.pool.query<{ status: string }>(
      `select status from branch.${table} where id=$1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findVendor(id: string) {
    const result = await this.pool.query<{ status: string; type: string }>(
      `select status, type from branch.vendor where id=$1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findPublishedUom(id: string) {
    const result = await this.pool.query<{ status: string }>(
      `select status from branch.uom where id=$1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async insert(client: PoolClient, input: StorageTankInput, actor: string) {
    const inserted = await client.query(
      `insert into branch.storage_tank (
         code, name, ownership, material_id, legal_entity_id, shipping_point_id, customer_code,
         vendor_id, dispatcher_point_id, capacity_l, safe_fill_l, safety_stock_l, reorder_l,
         capacity_uom_id, gauge_type, gauge_device_ref, last_calibration, inspection_due, certificate,
         valid_from, valid_to, reason, change_note, external_id, status, version_no, created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
         'DRAFT', 1, $25, $25
       )
       returning id, status, version_no as "versionNo"`,
      [...insertValues(input), actor],
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number };
  }

  async update(client: PoolClient, id: string, input: StorageTankInput, actor: string, status: string) {
    await client.query(
      `update branch.storage_tank set
         code=$1, name=$2, ownership=$3, material_id=$4, legal_entity_id=$5, shipping_point_id=$6,
         customer_code=$7, vendor_id=$8, dispatcher_point_id=$9, capacity_l=$10, safe_fill_l=$11,
         safety_stock_l=$12, reorder_l=$13, capacity_uom_id=$14, gauge_type=$15, gauge_device_ref=$16,
         last_calibration=$17, inspection_due=$18, certificate=$19, valid_from=$20, valid_to=$21,
         reason=$22, change_note=$23, external_id=$24,
         status=$26, version_no=version_no+1, updated_at=now(), updated_by=$25
       where id=$27 and deleted_at is null`,
      [...insertValues(input), actor, status, id],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.storage_tank
       set status=$1, version_no=version_no+1, change_note=$2, updated_at=now(), updated_by=$3
       where id=$4`,
      [status, note, actor, id],
    );
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.storage_tank_version (storage_tank_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(t), $2 from branch.storage_tank t where id=$1`,
      [id, actor],
    );
  }

  async audit(client: PoolClient, id: string, action: string, actor: string, note: string | null, payload: Record<string, unknown>) {
    await client.query(
      `insert into branch.storage_tank_audit (storage_tank_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.storage_tank_version where storage_tank_id=$1 order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.storage_tank_audit where storage_tank_id=$1 order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, name from branch.storage_tank
       where deleted_at is null and status = 'PUBLISHED' order by code`,
    );
    return result.rows;
  }
}

function insertValues(input: StorageTankInput) {
  return [
    input.code,
    input.name,
    input.ownership,
    input.materialId,
    input.legalEntityId ?? null,
    input.shippingPointId ?? null,
    input.customerCode ?? null,
    input.vendorId ?? null,
    input.dispatcherPointId ?? null,
    input.capacityL,
    input.safeFillL,
    input.safetyStockL ?? null,
    input.reorderL ?? null,
    input.capacityUomId ?? null,
    input.gaugeType ?? null,
    input.gaugeDeviceRef ?? null,
    input.lastCalibration ?? null,
    input.inspectionDue ?? null,
    input.certificate ?? null,
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
  if (pg.code === "23505") return new MdmError("CONFLICT", "Storage Tank code or externalId already exists", 409);
  if (pg.code === "23503") return new MdmError("PARENT_NOT_FOUND", "Material, Shipping Point, Vendor, or UOM was not found", 400);
  if (pg.code === "23514") return new MdmError("VALIDATION", "Storage Tank failed a database check", 400);
  return error;
}

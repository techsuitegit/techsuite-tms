import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { TelemetryDeviceInput } from "../services/telemetry-device-types";

const SELECT_LIST = `
  d.id, d.code, d.vendor_id as "vendorId", v.code as "vendorCode", v.name as "vendorName", v.type as "vendorType",
  d.model, d.imei, d.pairing_state as "pairingState",
  d.storage_tank_id as "storageTankId", t.code as "storageTankCode", t.name as "storageTankName",
  d.cadence, d.health, d.battery_pct as "batteryPct", d.signal,
  d.valid_from::text as "validFrom", d.valid_to::text as "validTo",
  d.reason, d.change_note as "changeNote", d.status, d.version_no as "versionNo",
  d.external_id as "externalId", d.created_at as "createdAt", d.updated_at as "updatedAt"
`;

const FROM_JOINS = `
  from branch.telemetry_device d
  join branch.vendor v on v.id = d.vendor_id
  left join branch.storage_tank t on t.id = d.storage_tank_id
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "d.code",
  status: "d.status",
  validFrom: "d.valid_from",
  updatedAt: "d.updated_at",
};

export type TelemetryDeviceRow = {
  id: string;
  status: string;
  version_no: number;
};

export type TelemetryDeviceListQuery = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class TelemetryDeviceRepository {
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

  async list(query: TelemetryDeviceListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["d.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(`(d.code ilike $${values.length} or d.imei ilike $${values.length})`);
    }
    if (query.status) {
      values.push(query.status);
      where.push(`d.status = $${values.length}`);
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.telemetry_device d where ${where.join(" and ")}`,
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
      `select ${SELECT_LIST} ${FROM_JOINS} where d.id=$1 and d.deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findVendor(vendorId: string) {
    const result = await this.pool.query<{ status: string; type: string }>(
      `select status, type from branch.vendor where id=$1 and deleted_at is null`,
      [vendorId],
    );
    return result.rows[0] ?? null;
  }

  async findTankStatus(storageTankId: string) {
    const result = await this.pool.query<{ status: string }>(
      `select status from branch.storage_tank where id=$1 and deleted_at is null`,
      [storageTankId],
    );
    return result.rows[0] ?? null;
  }

  async findPairedTank(storageTankId: string, exceptId: string | null) {
    const result = await this.pool.query<{ id: string }>(
      `select id from branch.telemetry_device
       where deleted_at is null
         and storage_tank_id = $1
         and pairing_state like 'PAIRED%'
         and ($2::uuid is null or id <> $2)
       limit 1`,
      [storageTankId, exceptId],
    );
    return result.rows[0] ?? null;
  }

  async insert(client: PoolClient, input: TelemetryDeviceInput, actor: string, id: string) {
    const inserted = await client.query(
      `insert into branch.telemetry_device (
         id, code, vendor_id, model, imei, pairing_state, storage_tank_id, cadence, health, battery_pct, signal,
         valid_from, valid_to, reason, change_note, status, version_no, external_id,
         created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'DRAFT',1,$16,$17,$17
       )
       returning id, status, version_no as "versionNo"`,
      [id, ...insertValues(input, actor)],
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number };
  }

  async update(client: PoolClient, id: string, input: TelemetryDeviceInput, actor: string, status: string) {
    const values = insertValues(input, actor);
    await client.query(
      `update branch.telemetry_device set
         code=$1, vendor_id=$2, model=$3, imei=$4, pairing_state=$5, storage_tank_id=$6, cadence=$7,
         health=$8, battery_pct=$9, signal=$10, valid_from=$11, valid_to=$12, reason=$13, change_note=$14,
         external_id=$15, status=$17, version_no=version_no+1, updated_at=now(), updated_by=$16
       where id=$18 and deleted_at is null`,
      [...values, status, id],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.telemetry_device
       set status=$1, version_no=version_no+1, change_note=coalesce($2, change_note), updated_at=now(), updated_by=$3
       where id=$4`,
      [status, note, actor, id],
    );
  }

  async lock(client: PoolClient, id: string): Promise<TelemetryDeviceRow> {
    const result = await client.query<TelemetryDeviceRow>(
      `select id, status, version_no from branch.telemetry_device where id=$1 and deleted_at is null for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "Telemetry Device was not found", 404);
    return row;
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.telemetry_device_version (telemetry_device_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(d), $2 from branch.telemetry_device d where id=$1`,
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
      `insert into branch.telemetry_device_audit (telemetry_device_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.telemetry_device_version where telemetry_device_id=$1 order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.telemetry_device_audit where telemetry_device_id=$1 order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups() {
    const result = await this.pool.query(
      `select id, code, code as name
       from branch.telemetry_device
       where deleted_at is null and status = 'PUBLISHED'
       order by code`,
    );
    return result.rows;
  }

  async exportRows() {
    const result = await this.pool.query(
      `select ${SELECT_LIST} ${FROM_JOINS}
       where d.deleted_at is null and d.status in ('DRAFT', 'PUBLISHED')
       order by d.code`,
    );
    return result.rows;
  }
}

function insertValues(input: TelemetryDeviceInput, actor: string) {
  return [
    input.code,
    input.vendorId,
    input.model,
    input.imei,
    input.pairingState,
    input.storageTankId,
    input.cadence,
    input.health,
    input.batteryPct,
    input.signal,
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
  if (pg.code === "23505" && pg.constraint === "telemetry_device_imei_udx") {
    return new MdmError("CONFLICT", "imei already exists", 409, "imei");
  }
  if (pg.code === "23505" && pg.constraint === "telemetry_device_paired_tank_udx") {
    return new MdmError("CONFLICT", "Storage Tank is already paired to another device", 409, "storageTankId");
  }
  if (pg.code === "23505") {
    return new MdmError("CONFLICT", "Telemetry Device code or externalId already exists", 409);
  }
  if (pg.code === "23503") return new MdmError("PARENT_NOT_FOUND", "Vendor or Storage Tank was not found", 400);
  if (pg.code === "23514") return new MdmError("VALIDATION", "Telemetry Device failed a database check", 400);
  return error;
}

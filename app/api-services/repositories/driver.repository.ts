import type { Pool, PoolClient } from "pg";

import { MdmError } from "../errors/mdm-error";
import type { DriverInput } from "../services/driver-types";

const SELECT_LIST = `
  d.id, d.code, d.name, d.phone,
  d.dl_number as "dlNumber", d.dl_valid_to::text as "dlValidTo", d.dl_class as "dlClass",
  d.first_licensed_on::text as "firstLicensedOn",
  d.haz_endorsed as "hazEndorsed", d.haz_endorsement_ref as "hazEndorsementRef",
  d.haz_endorsement_to::text as "hazEndorsementTo",
  d.home_shipping_point_id as "homeShippingPointId",
  sp.code as "homeShippingPointCode", sp.name as "homeShippingPointName",
  d.hos_ruleset_code as "hosRulesetCode", d.is_active as "isActive",
  d.valid_from::text as "validFrom", d.valid_to::text as "validTo",
  d.reason, d.change_note as "changeNote", d.status, d.version_no as "versionNo",
  d.external_id as "externalId", d.created_at as "createdAt", d.updated_at as "updatedAt"
`;

const FROM_JOINS = `
  from branch.driver d
  join branch.shipping_point sp on sp.id = d.home_shipping_point_id
`;

const SORT_COLUMNS: Record<string, string> = {
  code: "d.code",
  name: "d.name",
  status: "d.status",
  validFrom: "d.valid_from",
  dlValidTo: "d.dl_valid_to",
  updatedAt: "d.updated_at",
};

export type DriverRow = {
  id: string;
  status: string;
  version_no: number;
  code: string;
  dl_number: string;
  dl_valid_to: string;
  dl_class: string | null;
  haz_endorsed: boolean;
  haz_endorsement_ref: string | null;
  haz_endorsement_to: string | null;
  is_active: boolean;
};

export type DriverListQuery = {
  q: string;
  status: string | null;
  homeShippingPointId: string | null;
  hazEndorsed: boolean | null;
  expiringWithinDays: number | null;
  page: number;
  pageSize: number;
  sortKey: string;
};

export class DriverRepository {
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

  async list(query: DriverListQuery) {
    const offset = (query.page - 1) * query.pageSize;
    const sortCol = SORT_COLUMNS[query.sortKey] ?? SORT_COLUMNS.updatedAt;
    const values: unknown[] = [];
    const where = ["d.deleted_at is null"];
    if (query.q) {
      values.push(`%${query.q}%`);
      where.push(
        `(d.code ilike $${values.length} or d.name ilike $${values.length} or d.dl_number ilike $${values.length})`,
      );
    }
    if (query.status) {
      values.push(query.status);
      where.push(`d.status = $${values.length}`);
    }
    if (query.homeShippingPointId) {
      values.push(query.homeShippingPointId);
      where.push(`d.home_shipping_point_id = $${values.length}`);
    }
    if (query.hazEndorsed != null) {
      values.push(query.hazEndorsed);
      where.push(`d.haz_endorsed = $${values.length}`);
    }
    if (query.expiringWithinDays != null) {
      values.push(query.expiringWithinDays);
      where.push(
        `(d.dl_valid_to <= current_date + ($${values.length}::int) or (d.haz_endorsement_to is not null and d.haz_endorsement_to <= current_date + ($${values.length}::int)))`,
      );
    }
    const count = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.driver d where ${where.join(" and ")}`,
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

  async findShippingPointStatus(shippingPointId: string) {
    const result = await this.pool.query<{ status: string }>(
      `select status from branch.shipping_point where id=$1 and deleted_at is null`,
      [shippingPointId],
    );
    return result.rows[0] ?? null;
  }

  async countPublishedVehiclesWithDefault(driverId: string) {
    const result = await this.pool.query<{ total: string }>(
      `select count(*)::text as total from branch.vehicle
       where default_driver_id = $1 and deleted_at is null and status = 'PUBLISHED'`,
      [driverId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async findLastPublishedSafety(id: string) {
    const result = await this.pool.query<{ snapshot: Record<string, unknown> }>(
      `select snapshot from branch.driver_version
       where driver_id = $1 and (snapshot->>'status') = 'PUBLISHED'
       order by version_no desc limit 1`,
      [id],
    );
    return result.rows[0]?.snapshot ?? null;
  }

  async insert(client: PoolClient, input: DriverInput, actor: string, id: string) {
    const inserted = await client.query(
      `insert into branch.driver (
         id, code, name, phone, dl_number, dl_valid_to, dl_class, first_licensed_on,
         haz_endorsed, haz_endorsement_ref, haz_endorsement_to, home_shipping_point_id,
         hos_ruleset_code, is_active, valid_from, valid_to, reason, change_note,
         status, version_no, external_id, created_by, updated_by
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'DRAFT',1,$19,$20,$20
       )
       returning id, status, version_no as "versionNo"`,
      [id, ...insertValues(input, actor)],
    );
    return inserted.rows[0] as { id: string; status: string; versionNo: number };
  }

  async update(client: PoolClient, id: string, input: DriverInput, actor: string, status: string) {
    const values = insertValues(input, actor);
    await client.query(
      `update branch.driver set
         code=$1, name=$2, phone=$3, dl_number=$4, dl_valid_to=$5, dl_class=$6, first_licensed_on=$7,
         haz_endorsed=$8, haz_endorsement_ref=$9, haz_endorsement_to=$10, home_shipping_point_id=$11,
         hos_ruleset_code=$12, is_active=$13, valid_from=$14, valid_to=$15, reason=$16, change_note=$17,
         external_id=$18, status=$20, version_no=version_no+1, updated_at=now(), updated_by=$19
       where id=$21 and deleted_at is null`,
      [...values, status, id],
    );
  }

  async setStatus(client: PoolClient, id: string, status: string, note: string | null, actor: string) {
    await client.query(
      `update branch.driver
       set status=$1, version_no=version_no+1, change_note=coalesce($2, change_note), updated_at=now(), updated_by=$3
       where id=$4 and deleted_at is null`,
      [status, note, actor, id],
    );
  }

  async softDelete(client: PoolClient, id: string, actor: string) {
    await client.query(
      `update branch.driver
       set deleted_at=now(), version_no=version_no+1, updated_at=now(), updated_by=$2
       where id=$1 and deleted_at is null`,
      [id, actor],
    );
  }

  async lock(client: PoolClient, id: string): Promise<DriverRow> {
    const result = await client.query<DriverRow>(
      `select id, status, version_no, code, dl_number, dl_valid_to::text as dl_valid_to, dl_class,
              haz_endorsed, haz_endorsement_ref, haz_endorsement_to::text as haz_endorsement_to, is_active
       from branch.driver where id=$1 and deleted_at is null for update`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new MdmError("NOT_FOUND", "Driver was not found", 404);
    return row;
  }

  async snapshot(client: PoolClient, id: string, actor: string) {
    await client.query(
      `insert into branch.driver_version (driver_id, version_no, snapshot, recorded_by)
       select id, version_no, to_jsonb(d), $2 from branch.driver d where id=$1`,
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
      `insert into branch.driver_audit (driver_id, action, actor, note, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [id, action, actor, note, JSON.stringify(payload)],
    );
  }

  async versions(id: string) {
    const result = await this.pool.query(
      `select version_no as "versionNo", snapshot, recorded_at as "recordedAt", recorded_by as "recordedBy"
       from branch.driver_version where driver_id=$1 order by version_no`,
      [id],
    );
    return result.rows;
  }

  async auditLog(id: string) {
    const result = await this.pool.query(
      `select action, actor, note, payload, created_at as "createdAt"
       from branch.driver_audit where driver_id=$1 order by created_at`,
      [id],
    );
    return result.rows;
  }

  async lookups(filters: { q: string; hazEndorsed: boolean | null; homeShippingPointId: string | null }) {
    const values: unknown[] = [];
    const where = ["d.deleted_at is null", "d.status = 'PUBLISHED'", "d.is_active = true"];
    if (filters.q) {
      values.push(`%${filters.q}%`);
      where.push(`(d.code ilike $${values.length} or d.name ilike $${values.length})`);
    }
    if (filters.hazEndorsed != null) {
      values.push(filters.hazEndorsed);
      where.push(`d.haz_endorsed = $${values.length}`);
    }
    if (filters.homeShippingPointId) {
      values.push(filters.homeShippingPointId);
      where.push(`d.home_shipping_point_id = $${values.length}`);
    }
    const result = await this.pool.query(
      `select d.id, d.code, d.name, d.haz_endorsed as "hazEndorsed",
              d.dl_valid_to::text as "dlValidTo", d.haz_endorsement_to::text as "hazEndorsementTo"
       from branch.driver d
       where ${where.join(" and ")}
       order by d.code`,
      values,
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

function insertValues(input: DriverInput, actor: string) {
  return [
    input.code,
    input.name,
    input.phone,
    input.dlNumber,
    input.dlValidTo,
    input.dlClass ?? null,
    input.firstLicensedOn ?? null,
    input.hazEndorsed,
    input.hazEndorsementRef ?? null,
    input.hazEndorsementTo ?? null,
    input.homeShippingPointId,
    input.hosRulesetCode ?? null,
    input.isActive,
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
  const pg = error as { code?: string; constraint?: string };
  if (pg.code === "23505" && pg.constraint === "driver_code_udx") {
    return new MdmError("CONFLICT", "Driver code already exists", 409, "code");
  }
  if (pg.code === "23505" && pg.constraint === "driver_dl_number_udx") {
    return new MdmError("CONFLICT", "Driver licence number already exists", 409, "dlNumber");
  }
  if (pg.code === "23505") return new MdmError("CONFLICT", "Driver code, licence number, or externalId already exists", 409);
  if (pg.code === "23503") return new MdmError("PARENT_NOT_FOUND", "Related row was not found", 400);
  if (pg.code === "23514") return new MdmError("VALIDATION", "Driver failed a database check", 400);
  return error;
}
